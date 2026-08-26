import { describe, expect, it } from 'vitest';
import { stripFrontmatter, stripMarkdownFromString } from '../src/tomeMarkdownSanitizer';

describe('stripFrontmatter', () => {
	it('removes a leading frontmatter block and keeps the body', () => {
		expect(
			stripFrontmatter('---\ntitle: Keep\ntags: [a, b]\n---\n# Heading\n'),
		).toBe('# Heading\n');
	});

	it('handles CRLF line endings', () => {
		expect(stripFrontmatter('---\r\ntitle: Keep\r\n---\r\nBody\r\n')).toBe(
			'Body\r\n',
		);
	});

	it('removes an empty frontmatter block', () => {
		expect(stripFrontmatter('---\n---\nBody')).toBe('Body');
	});

	it('leaves a note without frontmatter untouched', () => {
		expect(stripFrontmatter('# Heading\n\nBody')).toBe('# Heading\n\nBody');
	});

	it('leaves a horizontal rule in the body alone', () => {
		const markdown = 'Intro\n\n---\n\nMore';
		expect(stripFrontmatter(markdown)).toBe(markdown);
	});

	it('stops at the first closing delimiter', () => {
		expect(stripFrontmatter('---\nkey: v\n---\nBody\n\n---\n\nMore')).toBe(
			'Body\n\n---\n\nMore',
		);
	});

	it('ignores a block that does not start at the very beginning', () => {
		const markdown = '\n---\nkey: v\n---\nBody';
		expect(stripFrontmatter(markdown)).toBe(markdown);
	});

	it('leaves an unterminated opening delimiter alone', () => {
		const markdown = '---\nkey: v\nBody with no close';
		expect(stripFrontmatter(markdown)).toBe(markdown);
	});

	it('tolerates trailing whitespace on the delimiters', () => {
		expect(stripFrontmatter('--- \nkey: v\n--- \nBody')).toBe('Body');
	});
});

describe('stripMarkdownFromString', () => {
	it.each([
		['[Blindsight](rules/senses.md#blindsight)', 'Blindsight'],
		['![alt](img/a.webp)', 'alt'],
		['[[page|alias]]', 'alias'],
		['**Bonus** Action', 'Bonus Action'],
		['`8d6` fire', '8d6 fire'],
		['~~gone~~', 'gone'],
	])('%s -> %s', (input, expected) => {
		expect(stripMarkdownFromString(input)).toBe(expected);
	});

	/**
	 * A link target holding a bracketed word, which the 2024 books are full of.
	 * Matching to the first `)` stopped inside `(Cantrip)` and left `%20Breastplate)`
	 * behind as visible text - eighteen magic items showed percent-encoding in their
	 * description because of it, which is how this was found.
	 */
	it('strips a link whose target contains parentheses', () => {
		const text = '[Enspelled (Cantrip) Breastplate](#Enspelled%20(Cantrip)%20Breastplate)';

		expect(stripMarkdownFromString(text)).toBe('Enspelled (Cantrip) Breastplate');
	});

	it('leaves no percent-encoding behind', () => {
		const text = 'See [Cursed](rules/item-properties.md#Cursed%20Items) items.';

		expect(stripMarkdownFromString(text)).toBe('See Cursed items.');
	});

	/**
	 * The description is rendered as plain paragraphs, so a table left as markdown
	 * arrives as one line of pipes and dashes. 52 items read that way - the alchemy
	 * jugs, the ammunition of slaying, every random-effect table in the treasure
	 * chapter.
	 */
	it('turns a table into readable lines', () => {
		const table = ['| Liquid | Max Amount |', '|--------|------------|', '| Beer | 4 gallons |'].join(
			'\n',
		);

		expect(stripMarkdownFromString(table)).toBe('Liquid — Max Amount\nBeer — 4 gallons');
	});

	/** Cells hold links too, and a flattened row must still be flattened text. */
	it('strips markup inside a table cell', () => {
		const table = '| [Acid](items/acid.md) | 8 ounces |';

		expect(stripMarkdownFromString(table)).toBe('Acid — 8 ounces');
	});

	it('leaves a line that merely contains a pipe alone', () => {
		expect(stripMarkdownFromString('Roll 1d4 | 1d6 for damage')).toBe('Roll 1d4 | 1d6 for damage');
	});
});
