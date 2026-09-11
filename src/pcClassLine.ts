/**
 * The classes a character note names, in the shape the Tome endpoint stores them.
 *
 * Tome keeps a character's classes as a list - one entry per class with its own level and
 * subclass - beside the free-text `class` line and the total `level` it has always taken, all three
 * inside the character's `dnd5e` bag. The server fills that list itself when a payload carries
 * none, by parsing the line, so a note that says only `class: Barbarian 3` needs nothing from
 * here and never did. This module is for
 * the note that wants to be explicit: a `classes:` property, which the D&D Beyond exporter does
 * not write but a person can, that names each class on its own.
 *
 * Deliberately free of any `obsidian` import, for the reason `routes.ts` gives: the tests run
 * with no module alias and no `obsidian` mock, and a module that reaches for it cannot be
 * imported from a test at all.
 *
 * Two shapes are read, and both may be mixed in one list:
 *
 * - An object: `{ class: Fighter, subclass: Champion, level: 3 }`. `name` is accepted for
 *   `class`, since a person writing YAML by hand will reach for either.
 * - A string: `Fighter (Champion) 3` - the way Tome itself prints a class, so a line copied
 *   off a sheet reads back. A string with no number is a single level.
 */

/** One class as `Dnd5eCharacter.classes` takes it - the server's `PcClass`, in its wire casing. */
export interface PcClassPayload {
	name: string;
	subclass?: string;
	level: number;
}

/** The frontmatter property this module reads. */
export const CLASSES_PROPERTY = 'classes';

const TRAILING_LEVEL = /\s+(\d{1,2})\s*$/;
const BRACKETED_SUBCLASS = /\s*[([]([^)\]]*)[)\]]/;
/** A dash only separates when it has whitespace on both sides: "Half-Elf" is a name. */
const DASHED_SUBCLASS = /\s+[-‐-―]\s+(.+)$/;

/**
 * The classes a `classes:` property names, or `undefined` when the note has none worth sending -
 * no property, a property of the wrong shape, or one whose every entry is blank. `undefined`
 * rather than an empty list, so the key is left off the payload and the server derives the
 * list from the class line as it does for every other note.
 */
export function classesFromFrontmatter(frontmatter: Record<string, unknown>): PcClassPayload[] | undefined {
	const raw = frontmatter[CLASSES_PROPERTY];
	const entries = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[/|]/) : [];
	const classes = entries.map(readEntry).filter((entry): entry is PcClassPayload => entry !== undefined);
	return classes.length > 0 ? classes : undefined;
}

function readEntry(entry: unknown): PcClassPayload | undefined {
	if (typeof entry === 'string') {
		return readLine(entry);
	}
	if (entry && typeof entry === 'object') {
		const record = entry as Record<string, unknown>;
		const name = text(record.class) ?? text(record.name);
		if (!name) {
			return undefined;
		}
		const subclass = text(record.subclass);
		const level = integer(record.level) ?? 1;
		return subclass ? { name, subclass, level } : { name, level };
	}
	return undefined;
}

/** "Fighter (Champion) 3", "Rogue — Thief 2" or "Wizard" - the name, its subclass, and its level. */
export function readLine(line: string): PcClassPayload | undefined {
	let value = line.trim();
	if (value.length === 0) {
		return undefined;
	}

	let level = 1;
	const trailing = TRAILING_LEVEL.exec(value);
	if (trailing) {
		level = parseInt(trailing[1]!, 10);
		value = value.slice(0, trailing.index).trimEnd();
	}

	let subclass: string | undefined;
	const bracket = BRACKETED_SUBCLASS.exec(value);
	if (bracket) {
		subclass = blank(bracket[1]!);
		value = (value.slice(0, bracket.index) + value.slice(bracket.index + bracket[0].length)).trim();
	} else {
		const dash = DASHED_SUBCLASS.exec(value);
		if (dash) {
			subclass = blank(dash[1]!);
			value = value.slice(0, dash.index).trimEnd();
		}
	}

	if (value.length === 0) {
		return undefined;
	}
	return subclass ? { name: value, subclass, level } : { name: value, level };
}

function text(value: unknown): string | undefined {
	return typeof value === 'string' ? blank(value) : undefined;
}

function integer(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return Math.max(1, Math.trunc(value));
	}
	if (typeof value === 'string') {
		const match = value.match(/\d+/);
		if (match) {
			return Math.max(1, parseInt(match[0], 10));
		}
	}
	return undefined;
}

function blank(value: string): string | undefined {
	const trimmed = value.trim();
	return trimmed.length === 0 ? undefined : trimmed;
}
