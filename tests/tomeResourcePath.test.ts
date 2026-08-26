import { describe, expect, it } from 'vitest';
import {
	findUninlinedResources,
	normalizeResourceRoot,
	vaultPathFromResourceUrl,
} from '../src/tomeResourcePath';

const ROOT = 'app://a1b2c3/C:/Users/x/Vault/';

describe('normalizeResourceRoot', () => {
	it('adds a trailing slash when the adapter omits it', () => {
		expect(normalizeResourceRoot('app://a1b2c3/C:/Users/x/Vault')).toBe(ROOT);
	});

	it('drops the mtime cache-buster', () => {
		expect(normalizeResourceRoot(`${ROOT}?1699999999`)).toBe(ROOT);
	});

	it('leaves an already-normalized root alone', () => {
		expect(normalizeResourceRoot(ROOT)).toBe(ROOT);
	});
});

describe('vaultPathFromResourceUrl', () => {
	it('extracts a vault-relative path', () => {
		expect(
			vaultPathFromResourceUrl(`${ROOT}attachments/img.png`, ROOT),
		).toBe('attachments/img.png');
	});

	it('drops the mtime query Obsidian appends', () => {
		expect(
			vaultPathFromResourceUrl(`${ROOT}attachments/img.png?1699999999`, ROOT),
		).toBe('attachments/img.png');
	});

	it('drops a fragment', () => {
		expect(vaultPathFromResourceUrl(`${ROOT}img.svg#icon`, ROOT)).toBe(
			'img.svg',
		);
	});

	it('accepts a root supplied without a trailing slash', () => {
		expect(
			vaultPathFromResourceUrl(
				`${ROOT}img.png`,
				'app://a1b2c3/C:/Users/x/Vault',
			),
		).toBe('img.png');
	});

	it('decodes percent-escaped characters', () => {
		expect(
			vaultPathFromResourceUrl(`${ROOT}my%20maps/keep%20plan.png`, ROOT),
		).toBe('my maps/keep plan.png');
	});

	it('rejects a different app:// host hash', () => {
		expect(
			vaultPathFromResourceUrl('app://zzzzzz/C:/Other/img.png', ROOT),
		).toBeNull();
	});

	it('rejects a path outside the vault root', () => {
		expect(
			vaultPathFromResourceUrl('app://a1b2c3/C:/Elsewhere/img.png', ROOT),
		).toBeNull();
	});

	it('rejects the root itself', () => {
		expect(vaultPathFromResourceUrl(ROOT, ROOT)).toBeNull();
	});

	it.each(['https://example.com/img.png', 'data:image/png;base64,AAAA', ''])(
		'rejects %s',
		(url) => {
			expect(vaultPathFromResourceUrl(url, ROOT)).toBeNull();
		},
	);

	it('rejects a malformed percent-escape rather than throwing', () => {
		expect(vaultPathFromResourceUrl(`${ROOT}bad%zz.png`, ROOT)).toBeNull();
	});
});

describe('findUninlinedResources', () => {
	it('finds nothing in a fully inlined document', () => {
		const html =
			'<div><img src="data:image/jpeg;base64,AAAA"><p>text</p></div>';
		expect(findUninlinedResources(html)).toEqual({ count: 0, samples: [] });
	});

	it('finds an image src that escaped inlining', () => {
		const html = `<img src="${ROOT}maps/keep.png?123">`;
		const found = findUninlinedResources(html);

		expect(found.count).toBe(1);
		expect(found.samples).toEqual([`${ROOT}maps/keep.png?123`]);
	});

	it('finds a url() inside an inline style', () => {
		const html = `<div style="background-image: url(${ROOT}banner.webp)"></div>`;
		expect(findUninlinedResources(html).count).toBe(1);
	});

	it('counts every occurrence but samples distinct urls', () => {
		const html = [
			`<img src="${ROOT}a.png">`,
			`<img src="${ROOT}a.png">`,
			`<img src="${ROOT}b.png">`,
		].join('');
		const found = findUninlinedResources(html);

		expect(found.count).toBe(3);
		expect(found.samples).toEqual([`${ROOT}a.png`, `${ROOT}b.png`]);
	});

	it('caps the sample list', () => {
		const html = Array.from(
			{ length: 20 },
			(_, i) => `<img src="${ROOT}img${i}.png">`,
		).join('');
		const found = findUninlinedResources(html);

		expect(found.count).toBe(20);
		expect(found.samples).toHaveLength(5);
	});

	it('does not swallow the closing quote or bracket', () => {
		const html = `<img src="${ROOT}a.png">`;
		expect(findUninlinedResources(html).samples[0]).toBe(`${ROOT}a.png`);
	});
});
