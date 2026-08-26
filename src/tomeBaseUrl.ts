/**
 * Why a base URL is not safe to send an API key to, or null when it is fine.
 *
 * The key travels in an X-Api-Key header on every request, so an http:// server hands it to
 * anyone on the path in clear text. Obsidian vaults are frequently synced between a laptop on a
 * home LAN and a phone on mobile data, which is exactly where this stops being theoretical.
 *
 * A warning rather than a refusal: someone running Tome on localhost over http is doing nothing
 * wrong, and blocking them would be. The point is that nobody types http:// against a remote host
 * without being told what it costs.
 *
 * Kept free of the `obsidian` import so it is testable - that module is an ambient API supplied by
 * the app at runtime and cannot be resolved under vitest, which is why every other pure helper
 * here lives in its own file too.
 */
export function baseUrlWarning(baseUrl: string): string | null {
	const trimmed = baseUrl.trim();
	if (!trimmed) {
		return null;
	}

	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		return 'That does not look like a complete address. It should start with https://';
	}

	if (url.protocol === 'https:') {
		return null;
	}

	if (url.protocol !== 'http:') {
		return 'Tome is reached over https://';
	}

	// Loopback never leaves the machine, so there is nothing on the path to overhear it.
	const isLoopback =
		url.hostname === 'localhost' ||
		url.hostname === '127.0.0.1' ||
		url.hostname === '[::1]' ||
		url.hostname === '::1';

	return isLoopback
		? null
		: 'This address is http://, so your API key is sent in clear text on every request. Use https:// unless the server is on this machine.';
}
