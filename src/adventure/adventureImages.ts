/**
 * Finds and pairs the pictures inside an adventure block.
 *
 * Filters on file extension rather than embed syntax, because the CLI writes
 * `![…](…)` for both a real image and a markdown transclusion inside an
 * `embed-*` callout - reading only the syntax would file 99 notes as
 * pictures.
 *
 * Pure and `obsidian`-free.
 */

/** Exported so anything else deciding "is this file a picture" uses the same list. */
export const IMAGE_EXTENSION = /\.(webp|png|jpe?g|gif)$/i;

export interface ImageMention {
	altText: string;
	/** Vault-relative path, decoded, with any `#` fragment stripped. */
	path: string;
	/** Whether the embed carried Obsidian's `#center` alignment hint. */
	center: boolean;
	start: number;
	end: number;
}

const MARKDOWN_IMAGE = /!\[([^\]]*)\]\(([^)]+)\)/g;
const WIKI_IMAGE = /!\[\[([^\]|#]+)(?:#([^\]|]*))?(?:\|([^\]]*))?\]\]/g;

function toMention(
	altText: string,
	target: string,
	start: number,
	length: number,
): ImageMention | null {
	const [rawPath, fragment] = target.split('#');
	const path = decodeURIComponent((rawPath ?? '').trim());
	if (!IMAGE_EXTENSION.test(path)) return null;

	return {
		altText: altText.trim(),
		path,
		center: (fragment ?? '').trim().toLowerCase() === 'center',
		start,
		end: start + length,
	};
}

/** Every image embed in `markdown`, `![]()` and `![[]]` alike, in document order. */
export function findImages(markdown: string): ImageMention[] {
	const found: ImageMention[] = [];

	const markdownPattern = new RegExp(MARKDOWN_IMAGE.source, MARKDOWN_IMAGE.flags);
	let match: RegExpExecArray | null;
	while ((match = markdownPattern.exec(markdown)) !== null) {
		const mention = toMention(match[1] ?? '', match[2] ?? '', match.index, match[0].length);
		if (mention) found.push(mention);
	}

	const wikiPattern = new RegExp(WIKI_IMAGE.source, WIKI_IMAGE.flags);
	while ((match = wikiPattern.exec(markdown)) !== null) {
		const target = `${match[1] ?? ''}${match[2] ? `#${match[2]}` : ''}`;
		const mention = toMention(match[3] ?? '', target, match.index, match[0].length);
		if (mention) found.push(mention);
	}

	return found.sort((a, b) => a.start - b.start);
}

/**
 * Whether an embed is the player-facing half of a gallery pair.
 *
 * Checked in the order the corpus makes reliable: an explicit `Player
 * Version` alt text is unambiguous and the most common signal, `Without
 * Tokens` is the same idea for a battle map, and a `-player`/`-pc` filename
 * suffix is what is left when neither alt text was written.
 */
export function isPlayerVersion(altText: string, path: string): boolean {
	const alt = altText.trim().toLowerCase();
	if (alt === 'player version' || alt === 'without tokens') return true;

	const stem = (path.split('/').pop() ?? '').replace(/\.[a-z0-9]+$/i, '');
	return /-(player|pc)$/i.test(stem);
}

/**
 * Whether a picture is a map, going by what it is captioned or named rather
 * than where it sits in the document.
 *
 * `[!gallery]` looked like the signal at first, but the corpus says otherwise:
 * Curse of Strahd alone puts 54 Tarokka-deck card faces and a run of journal-
 * handout facsimiles in gallery callouts, and three other books do the same
 * for concept-art and premade-character sheets - 347 non-map pictures
 * corpus-wide that a gallery-based rule would suggest as `Map`. The CLI runs
 * the other way too: 121 pictures the source explicitly titles "Map 1" or
 * "Map: Sword Coast" sit outside any gallery, under a plain `#center` embed,
 * so a gallery-based rule would suggest those as `Prop` instead.
 *
 * The word "map" in the caption or filename catches those two, but Waterdeep:
 * Dragon Heist shows it is not enough by itself - its forty-odd building
 * floorplans (Trollskull Alley, Gralhund Villa, Kolat Towers...) are captioned
 * with nothing but the location's name, because the room context already
 * makes "this is a map" obvious to a reader. What every one of those does
 * carry is the DM/player-pair naming a floorplan needs and a portrait never
 * does: a `-dm` filename, or a `-players`/`-player`/`-pc` filename, or a
 * caption that says so ("DM Version", "(Player Version)"). That pairing
 * convention is a second, independent signal for the same fact a keyword
 * sometimes doesn't spell out, and the corpus has zero pictures where it
 * fires on something that is not a map.
 */
const MAP_KEYWORD = /\bmaps?\b|battlemap/i;
const MAP_SIDE_CAPTION = /\b(?:dm|player)\s*version\b/i;
const MAP_SIDE_FILENAME = /[-_](?:dm|players?|pc)$/i;

export function looksLikeMap(altText: string, path: string): boolean {
	const stem = (path.split('/').pop() ?? '').replace(/\.[a-z0-9]+$/i, '');
	return (
		MAP_KEYWORD.test(altText) ||
		MAP_KEYWORD.test(path) ||
		MAP_SIDE_CAPTION.test(altText) ||
		MAP_SIDE_FILENAME.test(stem)
	);
}

export interface GalleryPair {
	dm: ImageMention;
	player: ImageMention | null;
}

/**
 * Pairs a gallery's images DM-then-player. An image with no player twin
 * (or whose twin never arrives) is still reported, alone.
 */
export function pairGallery(images: ImageMention[]): GalleryPair[] {
	const pairs: GalleryPair[] = [];
	let index = 0;

	while (index < images.length) {
		const current = images[index];
		if (!current) break;

		const next = images[index + 1];
		if (next && !isPlayerVersion(current.altText, current.path) && isPlayerVersion(next.altText, next.path)) {
			pairs.push({ dm: current, player: next });
			index += 2;
		} else {
			pairs.push({ dm: current, player: null });
			index += 1;
		}
	}

	return pairs;
}
