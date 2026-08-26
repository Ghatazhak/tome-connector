import { App, normalizePath } from 'obsidian';
import { getMimeType, toDataUri } from './tomeImageEncoding';
import {
	TomeImageKind,
	downscaleImageBytes,
	imageKindForKey,
} from './tomeImageDownscale';

/**
 * Reads the vault file at `path` and returns it as a base64 `data:` URI.
 * Shared by the JSON/statblock image resolution below and by other code
 * block buttons (e.g. maps) that need to embed a single image's raw bytes.
 *
 * `downscale` is the user's `downscaleImages` setting, passed as a plain boolean
 * rather than as the plugin: this module must not import `main.ts`, and
 * `tomeImageDownscale` must not learn that a settings object exists at all -
 * being free of both is what keeps it unit testable.
 *
 * It is required rather than defaulted so the compiler names every call site,
 * the same reason `fitWithin` gives for its `maxEdge`. A default here would mean
 * a new send path silently opting its images into one policy or the other.
 */
export async function readImageAsDataUri(
	app: App,
	path: string,
	kind: TomeImageKind,
	downscale: boolean,
): Promise<string> {
	const normalized = normalizePath(path);
	const buffer = await app.vault.adapter.readBinary(normalized);
	const mimeType = getMimeType(normalized);
	// "As-is" means the downscaler is not consulted at all, not that it is asked
	// for a cap it will decline to apply.
	return downscale
		? downscaleImageBytes(buffer, mimeType, kind)
		: toDataUri(buffer, mimeType);
}

/**
 * Recursively walks a parsed JSON value and replaces any string found under
 * a key named `map` with a base64 `data:` URI containing the image's raw
 * bytes. This embeds the image directly in the payload so the receiving API
 * doesn't need filesystem access at all, and it works on every platform
 * (desktop and mobile) since it goes through the vault adapter.
 *
 * The input is not mutated; a new value is returned. If a referenced file
 * can't be read, the operation fails so a local vault path is never sent.
 */
export async function resolveImagePaths(
	app: App,
	value: unknown,
	kind: TomeImageKind,
	downscale: boolean,
): Promise<unknown> {
	let missingFile = false;

	async function walk(node: unknown): Promise<unknown> {
		if (Array.isArray(node)) {
			return Promise.all(node.map(walk));
		}
		if (typeof node === 'object' && node !== null) {
			const entries = Object.entries(node as Record<string, unknown>);
			const result: Record<string, unknown> = {};
			await Promise.all(
				entries.map(async ([key, val]) => {
					const keyKind =
						typeof val === 'string' && val.trim() !== ''
							? imageKindForKey(key, kind)
							: null;
					if (keyKind) {
						try {
							result[key] = await readImageAsDataUri(
								app,
								val as string,
								keyKind,
								downscale,
							);
						} catch {
							missingFile = true;
							result[key] = val;
						}
					} else {
						result[key] = await walk(val);
					}
				}),
			);
			return result;
		}
		return node;
	}

	const resolved = await walk(value);

	if (missingFile) {
		throw new Error(
			'One or more images could not be read. Nothing was sent to Tome.',
		);
	}

	return resolved;
}
