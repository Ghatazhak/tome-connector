import { describe, expect, it } from 'vitest';

import { extractFencedBlocks, findFencedBlock } from '../src/recognizers/markdownBlocks';

/** Shaped like a real `ttrpg-convert-cli` bestiary note, frontmatter and all. */
const cliNote = [
	'---',
	'obsidianUIMode: preview',
	'cssclasses:',
	'- json5e-monster',
	'statblock: inline',
	'---',
	'# [Githyanki Knight](3-Mechanics/CLI/bestiary/aberration/githyanki-knight-xmm.md)',
	'*Source: Monster Manual (2024) p. 137*  ',
	'',
	'```statblock',
	'"name": "Githyanki Knight (XMM)"',
	'"ac": !!int "18"',
	'```',
	'^statblock'
].join('\n');

describe('extractFencedBlocks', () => {
	it('finds a statblock fence in a CLI note', () => {
		const blocks = extractFencedBlocks(cliNote);

		expect(blocks).toHaveLength(1);
		expect(blocks[0]?.language).toBe('statblock');
		expect(blocks[0]?.source).toBe('"name": "Githyanki Knight (XMM)"\n"ac": !!int "18"');
	});

	it('reports the opening line so an id can be written back', () => {
		expect(extractFencedBlocks(cliNote)[0]?.startLine).toBe(9);
	});

	it('finds several blocks of different languages', () => {
		const blocks = extractFencedBlocks('```encounter\nname: A\n```\n\n```leaflet\nid: m\n```');

		expect(blocks.map((block) => block.language)).toEqual(['encounter', 'leaflet']);
	});

	it('treats a bare fence as having no language', () => {
		expect(extractFencedBlocks('```\nplain\n```')[0]?.language).toBe('');
	});

	it('lower-cases the language so ```Statblock still matches', () => {
		expect(extractFencedBlocks('```Statblock\nx: 1\n```')[0]?.language).toBe('statblock');
	});

	/**
	 * A note documenting markdown nests a ``` fence inside a ```` one. Closing on
	 * the first three backticks would cut the block short and feed half a document
	 * to the YAML parser.
	 */
	it('does not close a longer fence on a shorter one inside it', () => {
		const blocks = extractFencedBlocks('````markdown\n```\ninner\n```\n````');

		expect(blocks).toHaveLength(1);
		expect(blocks[0]?.source).toBe('```\ninner\n```');
	});

	it('handles tilde fences', () => {
		expect(extractFencedBlocks('~~~statblock\nx: 1\n~~~')[0]?.source).toBe('x: 1');
	});

	it('does not close a backtick fence on a tilde one', () => {
		expect(extractFencedBlocks('```statblock\n~~~\nx: 1\n```')[0]?.source).toBe('~~~\nx: 1');
	});

	it('allows up to three spaces of indentation, as CommonMark does', () => {
		expect(extractFencedBlocks('   ```statblock\n   x: 1\n   ```')[0]?.language).toBe('statblock');
	});

	/** Runs to end of file rather than vanishing, which is what a renderer does. */
	it('keeps an unterminated fence', () => {
		expect(extractFencedBlocks('```statblock\nx: 1')[0]?.source).toBe('x: 1');
	});

	it('finds nothing in a note with no fences', () => {
		expect(extractFencedBlocks('# Title\n\nJust prose.')).toEqual([]);
	});
});

describe('findFencedBlock', () => {
	it('returns the first block of the language asked for', () => {
		expect(findFencedBlock(cliNote, 'statblock')?.startLine).toBe(9);
	});

	it('returns null when the language is absent', () => {
		expect(findFencedBlock(cliNote, 'leaflet')).toBeNull();
	});
});
