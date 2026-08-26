import { describe, expect, it } from 'vitest';
import {
	buildMultipartBody,
	createMultipartBoundary,
	sanitizeUploadFilename,
} from '../src/tomeMultipartBody';

/** Reads the body back byte-for-byte, so CRLFs and raw bytes stay visible. */
function asLatin1(body: ArrayBuffer): string {
	return new TextDecoder('latin1').decode(body);
}

function sequentialRandom(...values: number[]): () => number {
	let index = 0;
	return () => values[index++ % values.length]!;
}

describe('createMultipartBoundary', () => {
	it('produces an unquoted ASCII boundary', () => {
		const boundary = createMultipartBoundary(sequentialRandom(0.123456789));

		expect(boundary).toMatch(/^----TomeConnector[a-z0-9]+$/);
		expect(boundary.length).toBeLessThanOrEqual(70);
	});

	it('differs between calls', () => {
		const a = createMultipartBoundary(sequentialRandom(0.111111111));
		const b = createMultipartBoundary(sequentialRandom(0.999999999));

		expect(a).not.toBe(b);
	});
});

describe('buildMultipartBody', () => {
	const boundary = '----TomeConnectorTEST';

	it('lays out a field and a file with CRLF delimiters', () => {
		const { body } = buildMultipartBody(
			[{ name: 'title', value: 'Sunless Citadel' }],
			[
				{
					name: 'file',
					filename: 'Sunless Citadel.pdf',
					contentType: 'application/pdf',
					bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
				},
			],
			boundary,
		);

		expect(asLatin1(body)).toBe(
			`--${boundary}\r\n` +
				'Content-Disposition: form-data; name="title"\r\n' +
				'Content-Type: text/plain; charset=utf-8\r\n' +
				'\r\n' +
				'Sunless Citadel\r\n' +
				`--${boundary}\r\n` +
				'Content-Disposition: form-data; name="file"; ' +
				'filename="Sunless Citadel.pdf"\r\n' +
				'Content-Type: application/pdf\r\n' +
				'\r\n' +
				'%PDF\r\n' +
				`--${boundary}--\r\n`,
		);
	});

	it('reports a content type carrying the boundary', () => {
		const { contentType } = buildMultipartBody([], [], boundary);

		expect(contentType).toBe(`multipart/form-data; boundary=${boundary}`);
	});

	it('preserves binary file bytes exactly', () => {
		// The bytes a string-concatenation implementation would corrupt: NUL,
		// a bare CR and LF, and two values above 0x7F.
		const bytes = new Uint8Array([0x00, 0x0d, 0x0a, 0x25, 0xff, 0x80]);
		const { body } = buildMultipartBody(
			[],
			[
				{
					name: 'file',
					filename: 'x.pdf',
					contentType: 'application/pdf',
					bytes,
				},
			],
			boundary,
		);

		const header =
			`--${boundary}\r\n` +
			'Content-Disposition: form-data; name="file"; filename="x.pdf"\r\n' +
			'Content-Type: application/pdf\r\n' +
			'\r\n';
		const offset = new TextEncoder().encode(header).byteLength;

		expect(Array.from(new Uint8Array(body, offset, bytes.byteLength))).toEqual(
			Array.from(bytes),
		);
	});

	it('encodes a non-ASCII field value as UTF-8 bytes', () => {
		const { body } = buildMultipartBody(
			[{ name: 'title', value: 'Ördögök' }],
			[],
			boundary,
		);

		// 7 characters, but the three umlauts are two bytes each in UTF-8.
		expect(asLatin1(body)).toContain(
			new TextDecoder('latin1').decode(new TextEncoder().encode('Ördögök')),
		);
		expect(new TextEncoder().encode('Ördögök').byteLength).toBe(10);
	});

	it('emits only the closing boundary when there are no parts', () => {
		const { body } = buildMultipartBody([], [], boundary);

		expect(asLatin1(body)).toBe(`--${boundary}--\r\n`);
	});
});

describe('sanitizeUploadFilename', () => {
	it('keeps an ordinary folder name', () => {
		expect(sanitizeUploadFilename('My Folder')).toBe('My Folder.pdf');
	});

	it('replaces path separators and quotes', () => {
		expect(sanitizeUploadFilename('a/b\\c"d')).toBe('a_b_c_d.pdf');
	});

	it('strips characters that could break the header', () => {
		expect(sanitizeUploadFilename('bad\r\nname')).toBe('bad_name.pdf');
	});

	it('does not double the extension', () => {
		expect(sanitizeUploadFilename('Rulebook.pdf')).toBe('Rulebook.pdf');
	});

	it('falls back when nothing usable survives', () => {
		expect(sanitizeUploadFilename('…')).toBe('reference.pdf');
		expect(sanitizeUploadFilename('')).toBe('reference.pdf');
	});

	it('caps a very long name', () => {
		const result = sanitizeUploadFilename('x'.repeat(300));

		expect(result).toBe(`${'x'.repeat(100)}.pdf`);
	});

	it('trims leading and trailing dots and spaces', () => {
		expect(sanitizeUploadFilename('  ..Notes..  ')).toBe('Notes.pdf');
	});
});
