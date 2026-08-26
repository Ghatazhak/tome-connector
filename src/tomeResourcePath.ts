/**
 * Converts the `app://` URLs Obsidian puts on rendered `<img>` elements back
 * into vault-relative paths.
 *
 * Obsidian serves vault files to its own renderer as
 * `app://<hash>/<absolute vault path>/<file>?<mtime>`. Markdown-style embeds
 * (`![](attachments/map.png)`) land straight in the `src` with no wrapper
 * element to read the original link off, so this is the only handle available
 * for them.
 *
 * Free of any `obsidian` import so the URL arithmetic can be unit tested.
 */

/**
 * Finds vault resource URLs still present in the serialized export.
 *
 * Anything left after inlining is an image the print guest will fetch itself,
 * at full resolution and past the optimizer - which is how an export can
 * report a large saving and still produce an enormous PDF. Returns a sample so
 * the offending markup can be identified rather than guessed at.
 */
export function findUninlinedResources(html: string): {
	count: number;
	samples: string[];
} {
	const matches = html.match(/app:\/\/[^"')\s>]+/g) ?? [];
	const samples: string[] = [];
	for (const match of matches) {
		if (samples.length >= 5) break;
		if (!samples.includes(match)) samples.push(match);
	}
	return { count: matches.length, samples };
}

/** Drops the `?mtime` cache-buster and any `#fragment` from a resource URL. */
function stripQueryAndFragment(url: string): string {
	const cut = url.search(/[?#]/);
	return cut === -1 ? url : url.slice(0, cut);
}

/**
 * Normalizes the vault's resource root - the value of
 * `app.vault.adapter.getResourcePath('')` - into a bare prefix ending in a
 * single slash.
 */
export function normalizeResourceRoot(resourceRoot: string): string {
	const bare = stripQueryAndFragment(resourceRoot);
	return bare.endsWith('/') ? bare : `${bare}/`;
}

/**
 * Returns the vault-relative path `url` points at, or null if it isn't an
 * `app://` URL inside this vault (a remote image, a `data:` URI, or a
 * resource belonging to the app itself rather than the vault).
 */
export function vaultPathFromResourceUrl(
	url: string,
	resourceRoot: string,
): string | null {
	if (!url.startsWith('app://')) return null;

	const root = normalizeResourceRoot(resourceRoot);
	const bare = stripQueryAndFragment(url);
	if (!bare.startsWith(root)) return null;

	const relative = bare.slice(root.length);
	if (!relative) return null;

	try {
		return decodeURIComponent(relative);
	} catch {
		// A malformed percent-escape means this isn't a path we can resolve.
		return null;
	}
}
