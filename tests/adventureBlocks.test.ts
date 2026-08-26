import { describe, expect, it } from 'vitest';

import {
	chunk,
	classifyCallout,
	segment,
	splitBlocks,
	stripAnchors,
	stripCommentStubs,
	stripSourceLine,
	stripTrailingSpaces,
	unquote,
} from '../src/adventure/adventureBlocks';

describe('stripSourceLine', () => {
	it('drops the CLI source citation', () => {
		const markdown = 'Some prose.\n*Source: Lost Mine of Phandelver, page 12*\nMore prose.';
		expect(stripSourceLine(markdown)).toBe('Some prose.\nMore prose.');
	});
});

describe('stripAnchors', () => {
	it('drops a standalone anchor line', () => {
		expect(stripAnchors('Some prose.\n^140\nMore prose.')).toBe('Some prose.\nMore prose.');
	});

	it('drops a trailing anchor on a line of prose', () => {
		expect(stripAnchors('Some prose. ^140')).toBe('Some prose.');
	});

	it('drops an anchor sitting inside one or two levels of blockquote', () => {
		expect(stripAnchors('> Quoted text\n> ^140')).toBe('> Quoted text');
		expect(stripAnchors('> > Nested\n> > ^140')).toBe('> > Nested');
	});
});

describe('stripTrailingSpaces', () => {
	it('strips the CLI list-item hard-break markers', () => {
		expect(stripTrailingSpaces('- Item one  \n- Item two  ')).toBe('- Item one\n- Item two');
	});
});

describe('stripCommentStubs', () => {
	it('drops a standalone %% %% line', () => {
		expect(stripCommentStubs('Some prose.\n%% %%\nMore prose.')).toBe('Some prose.\nMore prose.');
	});

	it('leaves a line that merely contains the marker mid-sentence', () => {
		expect(stripCommentStubs('Not %% %% alone on the line.')).toBe('Not %% %% alone on the line.');
	});
});

describe('segment', () => {
	it('splits prose and a callout into separate segments', () => {
		const markdown = 'Some prose.\n\n> [!readaloud]\n> Boxed text.\n\nMore prose.';
		const segments = segment(markdown);

		expect(segments.map((entry) => entry.kind)).toEqual(['prose', 'callout', 'prose']);
		expect(segments[1]).toMatchObject({ calloutType: 'readaloud', calloutTitle: '' });
	});

	it('reads a callout title', () => {
		const segments = segment('> [!note] Adventure Maps\n> Some notes.');
		expect(segments[0]).toMatchObject({ calloutType: 'note', calloutTitle: 'Adventure Maps' });
	});

	it('keeps a nested blockquote inside its parent callout', () => {
		const markdown = '> [!note]\n> > [!example]\n> > Nested content.\n> Back to the outer quote.';
		const segments = segment(markdown);
		expect(segments).toHaveLength(1);
		expect(segments[0]?.lines).toEqual([
			'> [!note]',
			'> > [!example]',
			'> > Nested content.',
			'> Back to the outer quote.',
		]);
	});
});

describe('unquote', () => {
	it('strips exactly one level of quote marker per line', () => {
		expect(unquote(['> First line', '> > Nested line', '>Third line'])).toBe(
			'First line\n> Nested line\nThird line',
		);
	});
});

describe('classifyCallout', () => {
	it('routes a readaloud callout to boxed text for the players', () => {
		expect(classifyCallout('readaloud')).toEqual({ route: 'block', kind: 'ReadAloud', audience: 'Players' });
	});

	it('routes a gallery callout to the image pass, not text', () => {
		expect(classifyCallout('gallery')).toEqual({ route: 'gallery' });
	});

	it('routes note, quote, flowchart and embed callouts to GM notes', () => {
		for (const type of ['note', 'quote', 'flowchart', 'embed-npc']) {
			expect(classifyCallout(type)).toEqual({ route: 'block', kind: 'GmNote', audience: 'Gm' });
		}
	});

	it('routes an unrecognised callout to a GM note rather than dropping it', () => {
		expect(classifyCallout('something-the-cli-added-later')).toEqual({
			route: 'block',
			kind: 'GmNote',
			audience: 'Gm',
		});
	});

	it('routes npc, map and prop callouts to a forced destination', () => {
		expect(classifyCallout('npc')).toEqual({ route: 'forced-entity', to: 'NonPlayerCharacter' });
		expect(classifyCallout('map')).toEqual({ route: 'forced-entity', to: 'Map' });
		expect(classifyCallout('prop')).toEqual({ route: 'forced-entity', to: 'Prop' });
	});
});

describe('chunk', () => {
	it('returns the whole text as one chunk when it fits', () => {
		expect(chunk('short text', 100)).toEqual(['short text']);
	});

	it('splits at the last blank line before the limit', () => {
		const text = `${'a'.repeat(10)}\n\n${'b'.repeat(10)}`;
		const parts = chunk(text, 15);
		expect(parts).toEqual(['a'.repeat(10), 'b'.repeat(10)]);
	});

	it('hard-cuts when there is no blank line or newline to split at', () => {
		const text = 'a'.repeat(30);
		const parts = chunk(text, 10);
		expect(parts.join('')).toBe(text);
		expect(parts.every((part) => part.length <= 10)).toBe(true);
	});
});

describe('splitBlocks', () => {
	it('splits prose and a readaloud callout into separate blocks', () => {
		const markdown = 'GM setup notes here.\n\n> [!readaloud]\n> You see a goblin.\n\nMore GM notes.';
		const blocks = splitBlocks(markdown, 8000);

		expect(blocks).toEqual([
			{ type: 'text', kind: 'Markdown', audience: 'Gm', text: 'GM setup notes here.' },
			{ type: 'text', kind: 'ReadAloud', audience: 'Players', text: 'You see a goblin.' },
			{ type: 'text', kind: 'Markdown', audience: 'Gm', text: 'More GM notes.' },
		]);
	});

	it('turns a gallery callout into an image block between the prose around it', () => {
		const markdown = 'Before.\n\n> [!gallery]\n> ![](room.webp)\n\nAfter.';
		const blocks = splitBlocks(markdown, 8000);

		expect(blocks).toEqual([
			{ type: 'text', kind: 'Markdown', audience: 'Gm', text: 'Before.' },
			{ type: 'image', dmPath: 'room.webp', playerPath: null, alt: '' },
			{ type: 'text', kind: 'Markdown', audience: 'Gm', text: 'After.' },
		]);
	});

	it('pairs a DM image with the player version on the line below it', () => {
		const markdown = '> [!gallery]\n> ![](room.webp)\n> ![Player Version](room-player.webp)';
		const blocks = splitBlocks(markdown, 8000);

		expect(blocks).toEqual([
			{ type: 'image', dmPath: 'room.webp', playerPath: 'room-player.webp', alt: '' },
		]);
	});

	it('lifts a standalone picture out of prose into its own block', () => {
		const markdown = 'Before.\n\n![A portrait](art/npc.png#center)\n\nAfter.';
		const blocks = splitBlocks(markdown, 8000);

		expect(blocks).toEqual([
			{ type: 'text', kind: 'Markdown', audience: 'Gm', text: 'Before.' },
			{ type: 'image', dmPath: 'art/npc.png', playerPath: null, alt: 'A portrait' },
			{ type: 'text', kind: 'Markdown', audience: 'Gm', text: 'After.' },
		]);
	});

	it('leaves a picture sharing its line with a table row where it is', () => {
		const markdown = '| Waterdeep | ![City](art/city.webp) |';
		const blocks = splitBlocks(markdown, 8000);

		expect(blocks).toHaveLength(1);
		expect(blocks[0]?.type).toBe('text');
	});

	it('prepends a titled callout as a bold heading', () => {
		const blocks = splitBlocks('> [!note] Adventure Maps\n> Some notes.', 8000);
		expect(blocks).toEqual([
			{ type: 'text', kind: 'GmNote', audience: 'Gm', text: '**Adventure Maps**\n\nSome notes.' },
		]);
	});

	it('drops a %% %% stub that terminates a flowchart callout', () => {
		const markdown = '> [!flowchart]\n> Step one.\n%% %%\n';
		const blocks = splitBlocks(markdown, 8000);
		expect(blocks).toEqual([{ type: 'text', kind: 'GmNote', audience: 'Gm', text: 'Step one.' }]);
	});

	it('emits nothing for empty input', () => {
		expect(splitBlocks('', 8000)).toEqual([]);
		expect(splitBlocks('\n\n\n', 8000)).toEqual([]);
	});

	it('forces a wikilink inside an [!npc] callout to a NonPlayerCharacter node', () => {
		const blocks = splitBlocks('> [!npc]\n> [[Goblin Boss]]', 8000);
		expect(blocks).toEqual([
			{ type: 'forced-entity', to: 'NonPlayerCharacter', key: 'Goblin Boss', label: 'Goblin Boss' },
		]);
	});

	it('forces a markdown link inside an [!npc] callout too, not only a wikilink', () => {
		const blocks = splitBlocks('> [!npc]\n> [The Boss](NPCs/Goblin%20Boss.md)', 8000);
		expect(blocks).toEqual([
			{ type: 'forced-entity', to: 'NonPlayerCharacter', key: 'NPCs/Goblin%20Boss.md', label: 'The Boss' },
		]);
	});

	it('forces an image inside an [!map] callout to a Map node, overriding the looksLikeMap guess', () => {
		const blocks = splitBlocks('> [!map]\n> ![[floorplan.png]]', 8000);
		expect(blocks).toEqual([{ type: 'forced-entity', to: 'Map', key: 'floorplan.png', label: 'floorplan' }]);
	});

	it('forces an image inside an [!prop] callout to a Prop node', () => {
		const blocks = splitBlocks('> [!prop]\n> ![A goblet](goblet.png)', 8000);
		expect(blocks).toEqual([{ type: 'forced-entity', to: 'Prop', key: 'goblet.png', label: 'A goblet' }]);
	});

	it('falls back to an ordinary GM note when an [!npc] callout is not a sole reference', () => {
		// The wikilink stays unflattened here - `splitBlocks` never touches link syntax; that
		// is `adventureParser.ts`'s `flattenLinks` pass, one layer up.
		const blocks = splitBlocks('> [!npc]\n> Bram is actually [[Goblin Boss]] in disguise.', 8000);
		expect(blocks).toEqual([
			{ type: 'text', kind: 'GmNote', audience: 'Gm', text: 'Bram is actually [[Goblin Boss]] in disguise.' },
		]);
	});

	it('falls back to an ordinary GM note when an [!map] callout holds no image', () => {
		const blocks = splitBlocks('> [!map]\n> Just some notes about the map.', 8000);
		expect(blocks).toEqual([
			{ type: 'text', kind: 'GmNote', audience: 'Gm', text: 'Just some notes about the map.' },
		]);
	});
});
