import { MarkdownView, Notice, TFile, setIcon } from 'obsidian';
import type TomeConnectorPlugin from './main';
import { resolveImagePaths } from './tomeImageEmbedding';
import { joinUrl, sendJsonToTome } from './tomeApiClient';
import { getApiKey } from './tomeConnectorSettings';
import { stripMarkdown } from './tomeMarkdownSanitizer';
import { parsePcSheet } from './tomePcSheetParser';
import { CLASSES_PROPERTY } from './pcClassLine';
import { playerCharacterBody } from './playerCharacterBody';
import { TOME_ROUTES } from './routes';
import { chooseCharacterDestination } from './chooseCharacterDestination';
import { frontmatterKeyFor, type CharacterDestination } from './characterDestination';

// Frontmatter property that gates whether the button is shown at all. Its
// presence is taken as confirmation that this note is a D&D Beyond character
// sheet.
const REQUIRED_PROPERTY = 'dndbeyond_id';

// Only these frontmatter properties are ever read from the note's *frontmatter*
// - anything else present there is ignored. `playerCharacterBody` maps each onto
// the endpoint's `PlayerCharacterInputDto`: the name, gender, picture and D&D
// Beyond id at the top level, and the rest into the sheet's `dnd5e` bag.
//
// The note *body* is read separately by `tomePcSheetParser`: proficiencies,
// attacks, spells, features and inventory only ever exist there, as the tables
// the D&D Beyond exporter renders.
const ALLOWED_PROPERTIES = [
	'name',
	'race',
	'class',
	'level',
	'background',
	'alignment',
	'gender',
	'xp',
	'hp_max',
	'hp_current',
	'hp_temp',
	'ac',
	'speed',
	'proficiency_bonus',
	'str',
	'dex',
	'con',
	'int',
	'wis',
	'cha',
	'dndbeyond_id',
	'image',
	// Optional, and not something the exporter writes: one entry per class with its own
	// level, for a character with more than one. Without it the server reads the classes
	// out of `class` itself - see `pcClassLine`.
	CLASSES_PROPERTY,
] as const;

const BUTTON_ICON = 'upload-cloud';
const BUTTON_TITLE = 'Import as PC to Tome';
const SENDING_ICON = 'loader';
const SENDING_TITLE = 'Sending…';

// Tracks the action button (if any) currently shown on each markdown view,
// so it can be added/removed as the active file's frontmatter changes.
const actionButtons = new WeakMap<MarkdownView, HTMLElement>();

/**
 * Registers the per-note "Import as PC to Tome" action button that appears in
 * a markdown view's title bar whenever the note's frontmatter has a
 * `dndbeyond_id` property.
 */
export function registerCharacterSyncButton(plugin: TomeConnectorPlugin): void {
	const refreshAllViews = () => {
		for (const leaf of plugin.app.workspace.getLeavesOfType('markdown')) {
			if (leaf.view instanceof MarkdownView) {
				refreshView(plugin, leaf.view);
			}
		}
	};

	plugin.registerEvent(
		plugin.app.workspace.on('file-open', () => refreshAllViews()),
	);
	plugin.registerEvent(
		plugin.app.workspace.on('active-leaf-change', () => refreshAllViews()),
	);
	plugin.registerEvent(
		plugin.app.metadataCache.on('changed', (file) => {
			for (const leaf of plugin.app.workspace.getLeavesOfType('markdown')) {
				if (
					leaf.view instanceof MarkdownView &&
					leaf.view.file?.path === file.path
				) {
					refreshView(plugin, leaf.view);
				}
			}
		}),
	);

	plugin.app.workspace.onLayoutReady(() => refreshAllViews());
}

/**
 * Adds "Import as PC to Tome" to a D&D Beyond character note's context menu
 * in the File Explorer - the same send {@link handleClick} runs from the
 * title-bar button, offered from the file tree the way a folder's import
 * and export entries are.
 */
export function registerCharacterContextMenu(plugin: TomeConnectorPlugin): void {
	plugin.registerEvent(
		plugin.app.workspace.on('file-menu', (menu, file) => {
			if (!(file instanceof TFile) || !hasDndBeyondId(plugin, file)) return;

			menu.addItem((item) =>
				item
					.setTitle(BUTTON_TITLE)
					.setIcon(BUTTON_ICON)
					.onClick(() => void handleMenuClick(plugin, file)),
			);
		}),
	);
}

function hasDndBeyondId(plugin: TomeConnectorPlugin, file: TFile): boolean {
	const value: unknown =
		plugin.app.metadataCache.getFileCache(file)?.frontmatter?.[
			REQUIRED_PROPERTY
		];
	if (value === undefined || value === null) return false;
	if (typeof value === 'string') return value.trim() !== '';
	if (typeof value === 'number') return true;
	return false;
}

function refreshView(plugin: TomeConnectorPlugin, view: MarkdownView): void {
	const file = view.file;
	const shouldShow = file !== null && hasDndBeyondId(plugin, file);
	const existing = actionButtons.get(view);

	if (shouldShow && !existing) {
		const button = view.addAction(BUTTON_ICON, BUTTON_TITLE, () => {
			void handleClick(plugin, view, button);
		});
		actionButtons.set(view, button);
	} else if (!shouldShow && existing) {
		existing.remove();
		actionButtons.delete(view);
	}
}

/**
 * If `value` is a wikilink (e.g. `[[Zabadun.png]]`), resolves it to the
 * linked file's actual vault path using the note's own path as the link
 * resolution context. Returns `value` unchanged if it isn't a wikilink or
 * the link can't be resolved.
 */
function resolveWikilinkPath(
	plugin: TomeConnectorPlugin,
	value: unknown,
	sourcePath: string,
): unknown {
	if (typeof value !== 'string') return value;

	const match = value.match(/^\[\[([^\]|#]+)/);
	if (!match?.[1]) return value;

	const linkpath = match[1].trim();
	const dest = plugin.app.metadataCache.getFirstLinkpathDest(
		linkpath,
		sourcePath,
	);
	return dest ? dest.path : value;
}

/**
 * Reads a D&D Beyond note's frontmatter and body, maps them onto the Tome
 * `PlayerCharacterInputDto` shape, and posts it - the one send path shared by the
 * title-bar button and the context menu item.
 */
async function sendCharacter(plugin: TomeConnectorPlugin, file: TFile): Promise<void> {
	const destination = await chooseCharacterDestination(plugin);
	if (destination === null) return;

	const id = await sendJsonToTome(
		joinUrl(plugin.settings.baseUrl, routeFor(destination)),
		await buildCharacterPayload(plugin, file),
		getApiKey(plugin),
		// Left undefined for the vault, which is what makes the request account-scoped:
		// `requestHeaders` omits `X-Campaign-Id` when it is falsy, and the server's API-key
		// handler adds the campaign claim only when the header is there. Passing the remembered
		// campaign "harmlessly" would be worse than useless - a campaign the key owner no longer
		// owns fails the whole request with a 401, on an endpoint that reads no campaign at all.
		destination.kind === 'campaign' ? destination.campaignId : undefined,
	);
	if (id !== null) {
		await writeBackId(plugin, file, destination, id);
	}
}

function routeFor(destination: CharacterDestination): string {
	return destination.kind === 'vault'
		? TOME_ROUTES.importVaultCharacter
		: TOME_ROUTES.addPlayerCharacter;
}

/**
 * Reads the note's frontmatter and body and maps them onto `PlayerCharacterInputDto`.
 *
 * The same payload whichever destination it is bound for - both endpoints take the same DTO,
 * and the vault's create derives its game system rather than reading one off the sheet.
 */
async function buildCharacterPayload(plugin: TomeConnectorPlugin, file: TFile): Promise<string> {
	const frontmatter =
		plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {};

	const filtered: Record<string, unknown> = {};
	for (const key of ALLOWED_PROPERTIES) {
		if (key in frontmatter) {
			filtered[key] = frontmatter[key];
		}
	}
	if ('image' in filtered) {
		filtered.image = resolveWikilinkPath(plugin, filtered.image, file.path);
	}

	const cleaned = stripMarkdown(filtered);
	const resolved = (await resolveImagePaths(
		plugin.app,
		cleaned,
		'token',
		plugin.settings.downscaleImages,
	)) as Record<
		string,
		unknown
	>;
	// `cachedRead` rather than `read`: the body is only being parsed, and
	// the cache is already warm for the note the user is looking at.
	const sheet = parsePcSheet(await plugin.app.vault.cachedRead(file));
	return JSON.stringify(playerCharacterBody(resolved, sheet));
}

/**
 * Records the id under the property that names where it went, leaving the other alone - a note
 * sent to both destinations keeps both ids.
 */
async function writeBackId(
	plugin: TomeConnectorPlugin,
	file: TFile,
	destination: CharacterDestination,
	id: string,
): Promise<void> {
	const property = frontmatterKeyFor(destination);
	await plugin.app.fileManager.processFrontMatter(
		file,
		(frontmatter: Record<string, unknown>) => {
			frontmatter[property] = id;
		},
	);
}

async function handleMenuClick(plugin: TomeConnectorPlugin, file: TFile): Promise<void> {
	try {
		await sendCharacter(plugin, file);
	} catch (error) {
		console.error('Tome Connector: failed to send character', error);
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`Tome connector: ${message}`);
	}
}

async function handleClick(
	plugin: TomeConnectorPlugin,
	view: MarkdownView,
	button: HTMLElement,
): Promise<void> {
	const file = view.file;
	if (!file) return;

	button.setAttribute('aria-disabled', 'true');
	setIcon(button, SENDING_ICON);
	button.setAttribute('aria-label', SENDING_TITLE);

	try {
		await sendCharacter(plugin, file);
	} catch (error) {
		console.error('Tome Connector: failed to send character', error);
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`Tome connector: ${message}`);
	} finally {
		button.removeAttribute('aria-disabled');
		setIcon(button, BUTTON_ICON);
		button.setAttribute('aria-label', BUTTON_TITLE);
	}
}
