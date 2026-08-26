/**
 * Recognises a numbered-room heading - `B1: Entrance Tunnel`, `5A. Southwest
 * Garden`, a bare `25A` - so `adventureParser.ts` can promote it out of
 * whatever section it is buried in and give it its own scene.
 *
 * Applied to heading text at levels 3-6: only `##` sections get a scene by
 * default, and a room can sit several headings deep inside one.
 *
 * Pure and `obsidian`-free.
 */

export interface RoomHeading {
	/** `B1`, `5A`, `25`. */
	label: string;
	/** The room's own name, or the label again for a bare heading with none. */
	name: string;
}

/**
 * Up to three letters, then one to three digits, then an optional trailing
 * letter: `B1`, `12a`, `E5b`, `Q1`, `5A`, `D35`, `N3s`, a bare `9`.
 *
 * Letters restricted to `A-Z` so a heading like `2nd-Level Characters` cannot
 * match - lower-case prefixes are not a shape any room in the corpus uses.
 */
const LABEL = String.raw`[A-Z]{0,3}\d{1,3}[A-Za-z]?`;

/**
 * A separator is required after the label, or `###### 36 Sled Dogs` reads as
 * room `36`. `\S` after it stops an empty title from a heading like `#### 5. `.
 */
const NAMED_ROOM = new RegExp(`^(${LABEL})[.:)]\\s+(\\S.*)$`);

/** `##### 25A` on its own, with nothing further to call it. */
const BARE_ROOM = new RegExp(`^(${LABEL})$`);

export function asRoomHeading(headingText: string): RoomHeading | null {
	const trimmed = headingText.trim();

	const named = NAMED_ROOM.exec(trimmed);
	if (named?.[1] && named[2]) {
		return { label: named[1], name: named[2].trim() };
	}

	const bare = BARE_ROOM.exec(trimmed);
	if (bare?.[1]) {
		return { label: bare[1], name: bare[1] };
	}

	return null;
}
