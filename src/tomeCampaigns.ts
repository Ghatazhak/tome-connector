import { Modal, Notice, Setting, requestUrl } from 'obsidian';
import type { App } from 'obsidian';

import type TomeConnectorPlugin from './main';
import { API_KEY_HEADER_NAME, joinUrl } from './tomeApiClient';
import { getApiKey } from './tomeConnectorSettings';

export interface TomeCampaign {
	id: string;
	name: string;
}

export interface CampaignChoice {
	campaigns: TomeCampaign[];
	campaignId: string;
}

function isCampaign(value: unknown): value is TomeCampaign {
	if (typeof value !== 'object' || value === null) return false;
	const candidate = value as Record<string, unknown>;
	return typeof candidate.id === 'string' && typeof candidate.name === 'string';
}

/**
 * The campaigns owned by the account behind the configured API key, or null when the fetch
 * itself could not happen - no base URL, no key, a non-2xx, an unreadable body. Every one of
 * those has already been reported to the user by the time this returns.
 *
 * <b>An empty list is a success, not a failure.</b> That distinction is the whole reason this
 * is separate from {@link loadCampaignChoice}: for the six senders that can only target a
 * campaign, having none is a dead end worth saying so about, which is what that function still
 * does. For the character send it is an ordinary state - a player who keeps characters and has
 * never run a table - and the vault is exactly where their import should go.
 */
export async function loadCampaigns(
	plugin: TomeConnectorPlugin,
): Promise<TomeCampaign[] | null> {
	const baseUrl = plugin.settings.baseUrl.trim();
	if (baseUrl === '') {
		new Notice('Tome connector: set a base URL in the plugin settings first.');
		return null;
	}

	const apiKey = getApiKey(plugin);
	if (apiKey === '') {
		new Notice('Tome connector: set an API key in the plugin settings first.');
		return null;
	}

	try {
		const response = await requestUrl({
			url: joinUrl(baseUrl, '/api/campaigns'),
			method: 'GET',
			headers: { [API_KEY_HEADER_NAME]: apiKey },
			throw: false,
		});
		if (response.status < 200 || response.status >= 300) {
			new Notice(`Tome connector: could not load campaigns (${response.status}).`);
			return null;
		}

		const parsed: unknown = JSON.parse(response.text);
		if (!Array.isArray(parsed) || !parsed.every(isCampaign)) {
			throw new Error('The server returned an invalid campaign list.');
		}
		return parsed;
	} catch (error) {
		console.error('Tome Connector: failed to load campaigns', error);
		new Notice(
			`Tome connector: could not load campaigns. ${error instanceof Error ? error.message : String(error)}`,
		);
		return null;
	}
}

/** Loads only the campaigns owned by the account behind the configured API key. */
export async function loadCampaignChoice(
	plugin: TomeConnectorPlugin,
): Promise<CampaignChoice | null> {
	const campaigns = await loadCampaigns(plugin);
	if (campaigns === null) return null;

	if (campaigns.length === 0) {
		new Notice('Tome connector: this account has no campaigns. Create one in Tome first.');
		return null;
	}

	const remembered = campaigns.some((campaign) => campaign.id === plugin.settings.campaignId)
		? plugin.settings.campaignId
		: campaigns[0]!.id;
	return { campaigns, campaignId: remembered };
}

/** Renders the shared campaign row at the top of every send/review modal. */
export function renderCampaignSelector(
	parent: HTMLElement,
	choice: CampaignChoice,
	onChange: (campaignId: string) => void,
): void {
	new Setting(parent)
		.setName('Campaign')
		.setDesc('Choose where Tome should import these items.')
		.addDropdown((dropdown) => {
			for (const campaign of choice.campaigns) dropdown.addOption(campaign.id, campaign.name);
			dropdown.setValue(choice.campaignId).onChange(onChange);
		});
}

class CampaignSelectModal extends Modal {
	private selectedId: string;
	private confirmed = false;

	constructor(
		app: App,
		private readonly choice: CampaignChoice,
		private readonly action: string,
		private readonly onChoose: (campaignId: string | null) => void,
	) {
		super(app);
		this.selectedId = choice.campaignId;
	}

	override onOpen(): void {
		this.contentEl.empty();
		this.contentEl.createEl('h3', { text: `${this.action} to Tome` });
		renderCampaignSelector(this.contentEl, this.choice, (campaignId) => {
			this.selectedId = campaignId;
		});
		const buttons = this.contentEl.createDiv({ cls: 'tome-connector-sync-buttons' });
		buttons.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
		buttons.createEl('button', { text: this.action, cls: 'mod-cta' }).addEventListener('click', () => {
			this.confirmed = true;
			this.close();
		});
	}

	override onClose(): void {
		this.contentEl.empty();
		this.onChoose(this.confirmed ? this.selectedId : null);
	}
}

/** Opens the compact selector used by actions that did not already have a review modal. */
export async function chooseCampaign(
	plugin: TomeConnectorPlugin,
	action = 'Send',
): Promise<string | null> {
	const choice = await loadCampaignChoice(plugin);
	if (choice === null) return null;

	const campaignId = await new Promise<string | null>((resolve) => {
		new CampaignSelectModal(plugin.app, choice, action, resolve).open();
	});

	if (campaignId !== null && campaignId !== plugin.settings.campaignId) {
		plugin.settings.campaignId = campaignId;
		await plugin.saveSettings();
	}

	return campaignId;
}

export async function rememberCampaign(
	plugin: TomeConnectorPlugin,
	campaignId: string,
): Promise<void> {
	if (campaignId === plugin.settings.campaignId) return;
	plugin.settings.campaignId = campaignId;
	await plugin.saveSettings();
}
