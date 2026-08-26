import { Notice, requestUrl } from 'obsidian';
import { extractErrorMessage } from './extractTomeErrorMessage';
import { extractResponseId } from './extractTomeResponseId';

/** Header name the Tome server expects the API key under (see TomeVTT.Server.Auth.ApiKeyAuthenticationDefaults). */
export const API_KEY_HEADER_NAME = 'X-Api-Key';
export const CAMPAIGN_HEADER_NAME = 'X-Campaign-Id';

/**
 * Joins a configured base URL with a hardcoded API route, e.g.
 * `joinUrl('https://host.example.com/', '/api/encounter')` returns
 * `'https://host.example.com/api/encounter'`.
 */
export function joinUrl(baseUrl: string, path: string): string {
	return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/** What one POST did, in enough detail for a caller to report or retry it. */
export interface SendResult {
	ok: boolean;
	/** 0 when the request never reached the server. */
	status: number;
	/** The created or updated id, when the server returned one. */
	id: string | null;
	/** The server's own explanation, when it gave one. */
	message: string | null;
	/** Whether trying the same request again could plausibly succeed. */
	retryable: boolean;
}

/**
 * Statuses worth trying again.
 *
 * 429 is the one that matters for a bulk run: the server's global limiter allows
 * 600 requests a minute per user, so a large vault will meet it, and meeting it
 * is a pacing problem rather than a failed item. 5xx and a request that never
 * arrived at all get the same treatment. Everything else - a 400, a 402 over a
 * plan limit, a 409 on a duplicate name - is the server saying no for a reason
 * that will still be true on the next attempt.
 */
function isRetryable(status: number): boolean {
	return status === 429 || status === 408 || status >= 500;
}

/**
 * Sends a JSON payload and reports what happened, without saying anything to the
 * user.
 *
 * The quiet half of {@link sendJsonToTome}, split out for bulk sending: one
 * Notice per item is right when somebody pressed a button on one block, and
 * unusable when 709 creatures are going across.
 */
/** Sentinel so the noisy wrapper can tell "not configured" from a server refusal. */
export const NO_BASE_URL = 'No base URL is set in the plugin settings.';

function requestHeaders(apiKey?: string, campaignId?: string): Record<string, string> {
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (apiKey) headers[API_KEY_HEADER_NAME] = apiKey;
	if (campaignId) headers[CAMPAIGN_HEADER_NAME] = campaignId;
	return headers;
}

function toSendResult(status: number, text: string): SendResult {
	if (status >= 200 && status < 300) {
		return { ok: true, status, id: extractResponseId(text), message: null, retryable: false };
	}

	console.error(`Tome Connector: server responded with status ${status}`, text);
	return {
		ok: false,
		status,
		id: null,
		message: extractErrorMessage(text),
		retryable: isRetryable(status),
	};
}

export async function postJsonToTome(
	endpointUrl: string,
	payload: string,
	apiKey?: string,
	campaignId?: string,
): Promise<SendResult> {
	if (!endpointUrl) {
		return { ok: false, status: 0, id: null, message: NO_BASE_URL, retryable: false };
	}

	try {
		const response = await requestUrl({
			url: endpointUrl,
			method: 'POST',
			contentType: 'application/json',
			headers: requestHeaders(apiKey, campaignId),
			body: payload,
			throw: false,
		});

		return toSendResult(response.status, response.text);
	} catch (error) {
		console.error('Tome Connector: failed to send payload', error);
		return {
			ok: false,
			status: 0,
			id: null,
			message: error instanceof Error ? error.message : String(error),
			// The request never arrived, so the server has not refused anything.
			retryable: true,
		};
	}
}

/**
 * Posts a prebuilt `multipart/form-data` body, quietly.
 *
 * The twin of {@link postJsonToTome} for the two endpoints that take a file
 * beside their fields: the PDF reference upload, and the content-package import.
 * Everything but the body and its content type is shared, including the retry
 * classification, so a 429 backs off the same way on both.
 *
 * The caller builds the body with `buildMultipartBody`, because `requestUrl`
 * takes only `string | ArrayBuffer` and `FormData` is not an option - see that
 * module for why `requestUrl` rather than `fetch`.
 */
export async function postMultipartToTome(
	endpointUrl: string,
	body: ArrayBuffer,
	contentType: string,
	apiKey?: string,
	campaignId?: string,
): Promise<SendResult> {
	if (!endpointUrl) {
		return { ok: false, status: 0, id: null, message: NO_BASE_URL, retryable: false };
	}

	const headers: Record<string, string> = { 'Content-Type': contentType };
	if (apiKey) headers[API_KEY_HEADER_NAME] = apiKey;
	if (campaignId) headers[CAMPAIGN_HEADER_NAME] = campaignId;

	try {
		const response = await requestUrl({
			url: endpointUrl,
			method: 'POST',
			contentType,
			headers,
			body,
			throw: false,
		});

		return toSendResult(response.status, response.text);
	} catch (error) {
		console.error('Tome Connector: failed to send multipart payload', error);
		return {
			ok: false,
			status: 0,
			id: null,
			message: error instanceof Error ? error.message : String(error),
			retryable: true,
		};
	}
}

/**
 * Sends a raw JSON payload and tells the user how it went.
 *
 * Returns the `id` from the response body on success, or null if the request
 * failed or no id was present. Used by the per-block buttons, where one Notice
 * per send is exactly right.
 */
export async function sendJsonToTome(
	endpointUrl: string,
	payload: string,
	apiKey?: string,
	campaignId?: string,
): Promise<string | null> {
	const result = await postJsonToTome(endpointUrl, payload, apiKey, campaignId);

	if (result.ok) {
		new Notice('Sent to Tome successfully.');
		return result.id;
	}

	if (result.message === NO_BASE_URL) {
		new Notice('Tome connector: set a base URL in the plugin settings first.');
		return null;
	}

	// The server explains itself - a duplicated character name, a plan limit, a
	// title already taken - and those are things the person syncing can fix.
	// Sending them to the developer console to find out what went wrong made
	// every refusal look like a bug.
	new Notice(
		result.message
			? `Tome connector: ${result.message}`
			: `Tome connector: server responded with status ${result.status}. Check the console for the response body.`,
	);
	return null;
}
