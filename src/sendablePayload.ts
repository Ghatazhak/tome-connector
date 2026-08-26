import type { App } from 'obsidian';

import { resolveCreatureData } from './fantasyStatblocksBestiary';
import { mapToEncounterPayload } from './recognizers/encounter';
import { mapReferenceFrom } from './recognizers/map';
import type { Sendable } from './recognizers/noteScan';
import { mapToNpcPayload } from './recognizers/statblockCreature';
import { TOME_ROUTES } from './routes';
import { readImageAsDataUri, resolveImagePaths } from './tomeImageEmbedding';
import { stripMarkdown } from './tomeMarkdownSanitizer';

/**
 * Turns a scanned {@link Sendable} into a request.
 *
 * The impure half of the scan. Everything here needs the vault or the Fantasy
 * Statblocks bestiary — reading a token off disk, resolving a `monster:`
 * reference — which is exactly why the scan itself stops at intent and the
 * preview can count 709 creatures without touching a single image.
 *
 * **Throwing is how an item is reported as unresolvable.** `runBulkSend` treats a
 * thrown error as permanent for that item and does not retry it: a missing image
 * is still missing on the second attempt, and a bestiary that is not installed
 * will not be installed a second later.
 */

export interface PreparedRequest {
	/** Route appended to the configured base URL. */
	path: string;
	/** Serialised body. */
	body: string;
}

export async function buildRequest(
	app: App,
	sendable: Sendable,
	downscale: boolean,
): Promise<PreparedRequest> {
	switch (sendable.kind) {
		case 'creature':
			return {
				path: TOME_ROUTES.addNonPlayerCharacter,
				body: await creatureBody(app, sendable, downscale),
			};
		case 'encounter':
			return { path: TOME_ROUTES.addEncounter, body: encounterBody(sendable) };
		case 'map':
			return { path: TOME_ROUTES.addMap, body: await mapBody(app, sendable, downscale) };
		case 'magicItem':
			return {
				path: TOME_ROUTES.addMagicItem,
				body: await itemBody(app, sendable, downscale),
			};
		case 'equipmentItem':
			return {
				path: TOME_ROUTES.addEquipmentItem,
				body: await itemBody(app, sendable, downscale),
			};
		case 'spell':
			return {
				path: TOME_ROUTES.addSpell,
				body: await itemBody(app, sendable, downscale),
			};
	}
}

/**
 * The item as parsed, with its art read off disk if it has any. Shared by
 * `magicItem` and `equipmentItem` - both carry a finished item on the
 * sendable (`magicItemFrom`/`equipmentItemFrom` already did the parse), so
 * the only work left here is the image, which needs the vault.
 *
 * **A missing image does not lose the item.** Everywhere else in this file an
 * unreadable file throws, because a map without its image is not a map. An item is
 * its rules text; the picture is decoration, and a broken embed in one note out of
 * five hundred should cost that note its art rather than its entry in the library.
 * The path is dropped rather than sent, so a local vault path never reaches the
 * server either way.
 */
async function itemBody(
	app: App,
	sendable: Sendable,
	downscale: boolean,
): Promise<string> {
	const item = sendable.source['item'];
	if (item === undefined || item === null || typeof item !== 'object') {
		throw new Error(`No library entry was parsed from ${sendable.path}.`);
	}

	const { imagePath, ...fields } = item as Record<string, unknown>;
	if (typeof imagePath !== 'string' || imagePath === '') {
		return JSON.stringify(fields);
	}

	try {
		return JSON.stringify({
			...fields,
			image: await readImageAsDataUri(app, imagePath, 'token', downscale),
		});
	} catch {
		console.warn(`Tome Connector: could not read ${imagePath}; sending without the image.`);
		return JSON.stringify(fields);
	}
}

/**
 * Same three steps the per-block button takes, in the same order: resolve
 * against the bestiary, flatten the markdown links the CLI embeds in every
 * value, then swap image paths for bytes.
 */
async function creatureBody(
	app: App,
	sendable: Sendable,
	downscale: boolean,
): Promise<string> {
	const resolved = resolveCreatureData(sendable.source);
	const cleaned = stripMarkdown(resolved);
	const withImages = (await resolveImagePaths(
		app,
		cleaned,
		'token',
		downscale,
	)) as Record<string, unknown>;
	return JSON.stringify(mapToNpcPayload(withImages));
}

function encounterBody(sendable: Sendable): string {
	const payload = mapToEncounterPayload(sendable.source);
	if (!payload) {
		// The scan accepted it, so this means the note changed underneath the
		// preview - worth saying plainly rather than sending an empty encounter.
		throw new Error('This encounter no longer has a name.');
	}
	return JSON.stringify(payload);
}

async function mapBody(
	app: App,
	sendable: Sendable,
	downscale: boolean,
): Promise<string> {
	const reference = mapReferenceFrom(sendable.source);
	if (!reference) {
		throw new Error('This map no longer names an image.');
	}

	const payload: Record<string, unknown> = {
		title: reference.title,
		image: await readImageAsDataUri(app, reference.image, 'map', downscale),
	};
	if (reference.id !== undefined) payload.id = reference.id;
	return JSON.stringify(payload);
}
