/**
 * Removes a note's YAML frontmatter block.
 *
 * `MarkdownRenderer.render` is given raw file content, and unlike the reading
 * view it has no frontmatter handling - it renders the opening `---` as a
 * setext heading and dumps the raw YAML into the document. Obsidian only
 * treats a `---` block as frontmatter when it is the very first thing in the
 * file, so the same rule applies here: a `---` further down is a horizontal
 * rule and is left alone.
 */
export function stripFrontmatter(markdown: string): string {
	// Non-greedy so the first closing delimiter wins, and the inner group is
	// optional so an empty `---\n---` block still matches.
	const frontmatter = /^---[ \t]*\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/;
	return markdown.replace(frontmatter, '');
}

/**
 * A link target, allowing one level of nested parentheses.
 *
 * `[^)]*` stops at the first `)`, which is wrong whenever the target contains a
 * bracketed word - and the 2024 books are full of them:
 * `[Enspelled (Cantrip) Breastplate](#Enspelled%20(Cantrip)%20Breastplate)` matched
 * only as far as `(Cantrip)` and left `%20Breastplate)` behind as visible text.
 * Eighteen magic items showed percent-encoding in their description because of it.
 *
 * One level is enough for every target in the corpus, and a bounded pattern cannot
 * backtrack pathologically the way a general recursive one could.
 */
const TARGET = String.raw`\((?:[^()]|\([^()]*\))*\)`;

/**
 * Turns a markdown table into lines a person can read.
 *
 * The description a magic item carries is rendered as plain paragraphs, so a table
 * left as markdown arrives as `| Liquid | Max Amount | |--------|------------| |
 * Beer | 4 gallons |` on one line. 52 items read like that - the alchemy jugs, the
 * ammunition of slaying, every random-effect table in the treasure chapter.
 *
 * Cells are joined with an em dash and the separator row is dropped, which keeps
 * the pairing readable without pretending plain text can lay out columns.
 */
function stripTables(value: string): string {
	return value
		.split(/\r?\n/)
		.filter((line) => !/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line))
		.map((line) => {
			if (!/^\s*\|.*\|\s*$/.test(line)) return line;
			const cells = line
				.trim()
				.replace(/^\||\|$/g, '')
				.split('|')
				.map((cell) => cell.trim())
				.filter((cell) => cell !== '');
			return cells.join(' — ');
		})
		.join('\n');
}

/**
 * Strips common Markdown/Obsidian formatting out of a single string,
 * leaving only the human-readable text behind, e.g.
 * `"[Blindsight](3-Mechanisc/CLI/rules?senses.md#blindsight)"` becomes
 * `"Blindsight"` and `"**Bonus** Action"` becomes `"Bonus Action"`.
 */
export function stripMarkdownFromString(value: string): string {
	let result = value;

	// Tables first: their cells hold links, and flattening one afterwards would be
	// flattening rows that no longer look like rows.
	result = stripTables(result);

	// Images: ![alt](url) -> alt
	result = result.replace(new RegExp(`!\\[([^\\]]*)\\]${TARGET}`, 'g'), '$1');
	// Links: [text](url) -> text
	result = result.replace(new RegExp(`\\[([^\\]]*)\\]${TARGET}`, 'g'), '$1');
	// Wikilinks: [[page|alias]] -> alias, [[page#heading]] -> page
	result = result.replace(
		/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g,
		(_match, page: string, alias?: string) => alias ?? page,
	);
	// Strikethrough: ~~text~~ -> text
	result = result.replace(/~~([^~]+)~~/g, '$1');
	// Bold: **text** or __text__ -> text
	result = result.replace(/\*\*([^*]+)\*\*/g, '$1');
	result = result.replace(/__([^_]+)__/g, '$1');
	// Italic: *text* or _text_ -> text
	result = result.replace(/\*([^*]+)\*/g, '$1');
	result = result.replace(/_([^_]+)_/g, '$1');
	// Inline code: `text` -> text
	result = result.replace(/`([^`]+)`/g, '$1');
	// Headings: leading #'s on a line
	result = result.replace(/^\s{0,3}#{1,6}\s+/gm, '');
	// Blockquotes: leading > on a line
	result = result.replace(/^\s{0,3}>\s?/gm, '');
	// Unordered list markers: leading -, *, + on a line
	result = result.replace(/^\s*[-*+]\s+/gm, '');
	// Ordered list markers: leading "1. " on a line
	result = result.replace(/^\s*\d+\.\s+/gm, '');
	// Horizontal rules on their own line
	result = result.replace(/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/gm, '');

	// Collapse whitespace left behind by removed markers.
	result = result.replace(/[ \t]{2,}/g, ' ');
	result = result.replace(/\n{3,}/g, '\n\n');

	return result.trim();
}

/**
 * Recursively walks a parsed JSON-like value and strips Markdown/Obsidian
 * formatting out of every string found. The input is not mutated; a new
 * value is returned.
 */
export function stripMarkdown(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(stripMarkdown);
	}
	if (typeof value === 'string') {
		return stripMarkdownFromString(value);
	}
	if (typeof value === 'object' && value !== null) {
		const entries = Object.entries(value as Record<string, unknown>);
		const result: Record<string, unknown> = {};
		for (const [key, val] of entries) {
			result[key] = stripMarkdown(val);
		}
		return result;
	}
	return value;
}
