/**
 * Assembles a `multipart/form-data` request body by hand.
 *
 * Obsidian's `requestUrl` only accepts a `string | ArrayBuffer` body, so
 * `FormData` isn't an option - and `requestUrl` is what the rest of this
 * plugin uses precisely because it sidesteps the CORS restrictions a plain
 * `fetch` from the renderer would hit.
 *
 * Free of any `obsidian` import so the byte layout can be unit tested.
 */

/** Every boundary and header delimiter in multipart/form-data is CRLF. */
const CRLF = '\r\n';

export interface MultipartField {
	name: string;
	value: string;
}

export interface MultipartFilePart {
	name: string;
	filename: string;
	contentType: string;
	bytes: Uint8Array;
}

export interface MultipartBody {
	/** Ready to use as both the `Content-Type` header and `requestUrl`'s `contentType`. */
	contentType: string;
	body: ArrayBuffer;
}

/**
 * Builds a boundary that cannot occur in the payload. `random` is injectable
 * so tests can assert the format without stubbing globals; the result is
 * ASCII-only and well under RFC 2046's 70-character limit, so it never needs
 * quoting in the header.
 */
export function createMultipartBoundary(
	random: () => number = Math.random,
): string {
	const chunk = () => random().toString(36).slice(2, 12);
	return `----TomeConnector${chunk()}${chunk()}`;
}

/**
 * Turns a reference title into a filename safe to interpolate into a
 * `Content-Disposition` header. Anything outside a conservative allowlist
 * becomes an underscore, which also rules out the CR/LF and quote characters
 * that would otherwise let a folder name break the header.
 *
 * The filename is cosmetic - the server prefers the `title` field and only
 * falls back to this - so mangling an exotic name is preferable to failing.
 */
export function sanitizeUploadFilename(title: string): string {
	const withoutExtension = title.replace(/\.pdf$/i, '');
	const trimmed = withoutExtension
		.replace(/[^A-Za-z0-9._ -]/g, '_')
		.replace(/_{2,}/g, '_')
		.slice(0, 100)
		.replace(/^[\s._-]+|[\s._-]+$/g, '');
	return `${trimmed || 'reference'}.pdf`;
}

function encodeAscii(value: string): Uint8Array {
	return new TextEncoder().encode(value);
}

/**
 * Lays the parts out as:
 *
 * ```
 * --boundary CRLF
 * Content-Disposition: form-data; name="title" CRLF
 * Content-Type: text/plain; charset=utf-8 CRLF
 * CRLF
 * <value bytes> CRLF
 * --boundary CRLF
 * ... file part ...
 * --boundary-- CRLF
 * ```
 *
 * The explicit charset on text fields matters here: the reference title is
 * the server's upsert key, so a mangled non-ASCII folder name would silently
 * create a second reference instead of replacing the first.
 *
 * Segments are concatenated as bytes, never as a string - round-tripping
 * binary through `String.fromCharCode`/`btoa` corrupts everything above 0x7F.
 */
export function buildMultipartBody(
	fields: readonly MultipartField[],
	files: readonly MultipartFilePart[],
	boundary: string,
): MultipartBody {
	const segments: Uint8Array[] = [];

	for (const field of fields) {
		segments.push(
			encodeAscii(
				`--${boundary}${CRLF}` +
					`Content-Disposition: form-data; name="${field.name}"${CRLF}` +
					`Content-Type: text/plain; charset=utf-8${CRLF}${CRLF}`,
			),
		);
		segments.push(new TextEncoder().encode(field.value));
		segments.push(encodeAscii(CRLF));
	}

	for (const file of files) {
		segments.push(
			encodeAscii(
				`--${boundary}${CRLF}` +
					`Content-Disposition: form-data; name="${file.name}"; ` +
					`filename="${file.filename}"${CRLF}` +
					`Content-Type: ${file.contentType}${CRLF}${CRLF}`,
			),
		);
		segments.push(file.bytes);
		segments.push(encodeAscii(CRLF));
	}

	segments.push(encodeAscii(`--${boundary}--${CRLF}`));

	const total = segments.reduce((sum, segment) => sum + segment.byteLength, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const segment of segments) {
		out.set(segment, offset);
		offset += segment.byteLength;
	}

	return {
		contentType: `multipart/form-data; boundary=${boundary}`,
		body: out.buffer,
	};
}
