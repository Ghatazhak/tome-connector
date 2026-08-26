/**
 * Turns a Fantasy Statblocks creature into the Tome server's
 * `NonPlayerCharacter` shape.
 *
 * A pure module with no `obsidian` import, deliberately: the plugin's own rule -
 * stated in the headers of `tomeBaseUrl.ts` and `tomeChapterPlan.ts` - is that
 * logic worth testing gets its own file, because `obsidian` cannot resolve under
 * vitest. All of this mapping previously lived inside `syncNpcStatblockToTome.ts`
 * beside the DOM handling and so had no tests at all.
 *
 * The field vocabulary is Fantasy Statblocks', which is also what
 * `ttrpg-convert-cli` writes. Where the two differ the CLI is the reference,
 * because that is where the volume is.
 */

import { stripMarkdownFromString } from '../tomeMarkdownSanitizer';

/** The `NonPlayerCharacter` model's PascalCase shape, as the endpoint wants it. */
export interface NamedAbility {
	Name: string;
	Desc: string;
}

export interface NpcPayload {
	[key: string]: unknown;
	Name: string;
	AC: number;
	HP: string;
}

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/* -------------------------------------------------------------------------
 * Coercion. Fantasy Statblocks is permissive about types; the server is not.
 * ---------------------------------------------------------------------- */

/**
 * Extracts a leading integer from a value that may be a number or a string like
 * `"15 (natural armor)"`. Returns undefined when there is no integer to find.
 */
export function toIntSafe(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return Math.trunc(value);
	}
	if (typeof value === 'string') {
		const match = value.match(/-?\d+/);
		if (match) return parseInt(match[0], 10);
	}
	return undefined;
}

/** Stringifies without `Object`'s `"[object Object]"` fallback. */
export function toStringSafe(value: unknown): string | undefined {
	if (typeof value === 'string') return value;
	if (typeof value === 'number' && Number.isFinite(value)) return String(value);
	return undefined;
}

/** `[STR, DEX, CON, INT, WIS, CHA]`, or undefined if it is not six numbers. */
export function toStatsArray(value: unknown): number[] | undefined {
	if (!Array.isArray(value)) return undefined;
	if (!value.every((entry): entry is number => typeof entry === 'number')) {
		return undefined;
	}
	return value;
}

function toNamedAbility(entry: unknown): NamedAbility | null {
	if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
		return null;
	}
	const record = entry as Record<string, unknown>;
	const name = record.name ?? record.Name;
	const desc = record.desc ?? record.Desc;
	if (typeof name !== 'string' || name.trim() === '') return null;
	return { Name: name, Desc: typeof desc === 'string' ? desc : '' };
}

export function toNamedAbilityList(value: unknown): NamedAbility[] {
	if (!Array.isArray(value)) return [];
	const result: NamedAbility[] = [];
	for (const entry of value) {
		const converted = toNamedAbility(entry);
		if (converted) result.push(converted);
	}
	return result;
}

/* -------------------------------------------------------------------------
 * Normalisers for the shapes Fantasy Statblocks uses and the server does not.
 * ---------------------------------------------------------------------- */

/** `hp` may be `58` or `"58 (9d10+9)"`; the server wants one type. */
export function normalizeHp(value: unknown): unknown {
	return typeof value === 'number' ? String(value) : value;
}

/**
 * `"Goblin (Reskinned)"` -> `"Goblin"`.
 *
 * The CLI suffixes every name with its source, e.g.
 * `"Aberrant Spirit (Beholderkin) (XPHB)"`, so this also strips that - which is
 * wanted, but note it takes the sub-name with it. That is the existing
 * behaviour and libraries key on name, so two sources' Goblins collapse onto
 * one entry rather than becoming `Goblin (XMM)` and `Goblin (XPHB)`.
 */
export function normalizeName(value: unknown): unknown {
	if (typeof value !== 'string') return value;
	return value
		.replace(/\s*\([^)]*\)/g, '')
		.replace(/\s{2,}/g, ' ')
		.trim();
}

/**
 * `{dexterity: 7}` -> `{name: "Dexterity", desc: "+7"}`, matching the shape
 * `skillsaves` already uses. Anything else passes through untouched.
 */
export function normalizeSaveEntry(entry: unknown): unknown {
	if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
		return entry;
	}

	const record = entry as Record<string, unknown>;
	const keys = Object.keys(record);
	if (keys.length !== 1) return entry;

	const ability = keys[0];
	if (ability === undefined) return entry;
	const modifier = record[ability];
	if (typeof modifier !== 'number') return entry;

	return {
		name: ability.charAt(0).toUpperCase() + ability.slice(1),
		desc: modifier >= 0 ? `+${modifier}` : `${modifier}`,
	};
}

export function normalizeSaves(value: unknown): unknown {
	if (!Array.isArray(value)) return value;
	return value.map(normalizeSaveEntry);
}

/** As above, minus the `null` placeholders Fantasy Statblocks leaves for unused slots. */
export function normalizeSkillSaves(value: unknown): unknown {
	if (!Array.isArray(value)) return value;
	return value
		.filter((entry) => entry !== null && entry !== undefined)
		.map(normalizeSaveEntry);
}

/* -------------------------------------------------------------------------
 * Resolution
 * ---------------------------------------------------------------------- */

/**
 * Whether a block carries enough of its own data to be sent without consulting
 * the bestiary.
 *
 * **This is what lets the connector work with Fantasy Statblocks switched off.**
 * `ttrpg-convert-cli` writes fully self-contained statblocks, so the common case
 * needs no plugin at all. A block that is only `monster: Goblin` does not, and
 * cannot be rescued - it contains almost nothing.
 *
 * `stats` is the test rather than `name`, because every block has a name and
 * only a real statblock has six ability scores.
 */
export function hasInlineStats(record: Record<string, unknown>): boolean {
	return toStatsArray(record.stats) !== undefined;
}

/**
 * Merges bestiary data under a block's own fields, then normalises the shapes
 * that differ from the server's. Local fields win, mirroring how Fantasy
 * Statblocks itself resolves a `monster:` reference.
 *
 * `base` is null when there is no bestiary to consult, in which case the block
 * stands alone.
 */
export function mergeCreature(
	base: Record<string, unknown> | null,
	local: Record<string, unknown>,
): Record<string, unknown> {
	const merged: Record<string, unknown> = base ? { ...base, ...local } : { ...local };

	if ('hp' in merged) merged.hp = normalizeHp(merged.hp);
	if ('name' in merged) merged.name = normalizeName(merged.name);
	if ('saves' in merged) merged.saves = normalizeSaves(merged.saves);
	if ('skillsaves' in merged) merged.skillsaves = normalizeSkillSaves(merged.skillsaves);

	return merged;
}

/* -------------------------------------------------------------------------
 * Mapping
 * ---------------------------------------------------------------------- */

function optionalString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

/**
 * Fields the server's model has no home for, folded into `Traits` rather than
 * dropped.
 *
 * The alternative was silence: `gear` alone appears on 131 of the CLI's 667
 * creatures, and a knight arriving with no plate armour recorded anywhere is a
 * worse outcome than a trait called "Gear". Each is a real thing a GM reads at
 * the table, and a trait is where they will look for it.
 */
function extraTraits(record: Record<string, unknown>): NamedAbility[] {
	const extras: NamedAbility[] = [];

	if (Array.isArray(record.gear)) {
		const gear = record.gear
			.filter((entry): entry is string => typeof entry === 'string')
			.map(stripMarkdownFromString)
			.filter((entry) => entry !== '');
		if (gear.length > 0) {
			extras.push({ Name: 'Gear', Desc: gear.join(', ') });
		}
	}

	for (const [key, label] of [
		['regional_effects', 'Regional Effects'],
		['lair_actions', 'Lair Actions'],
	] as const) {
		for (const entry of toNamedAbilityList(record[key])) {
			extras.push({ Name: `${label}: ${entry.Name}`, Desc: entry.Desc });
		}
	}

	return extras;
}

/**
 * Legendary actions, with the preamble the CLI stores separately restored to
 * the front of the list. Without it the list reads as a set of options with no
 * statement of how many the creature may take.
 */
function legendaryActions(record: Record<string, unknown>): NamedAbility[] {
	const actions = toNamedAbilityList(record.legendary_actions);
	const description = optionalString(record.legendary_description);
	if (!description || actions.length === 0) return actions;
	return [{ Name: 'Legendary Actions', Desc: description }, ...actions];
}

/**
 * Maps a resolved creature onto the endpoint's `NonPlayerCharacter` model,
 * dropping the fields the server does not model (`layout`, `fage_stats`,
 * `bestiary`, `modifier`, `source`).
 */
export function mapToNpcPayload(record: Record<string, unknown>): NpcPayload {
	const payload: NpcPayload = {
		Image: optionalString(record.image) ?? '',
		Name: optionalString(record.name) ?? '',
		Size: optionalString(record.size),
		Type: optionalString(record.type),
		Subtype: optionalString(record.subtype),
		Alignment: optionalString(record.alignment),
		// `ac` on 618 of the CLI's creatures, `ac_class` on 138 - a summon's AC is
		// a formula ("11 + the spell's level"), and the leading integer is the
		// best single number available for a field the server types as an int.
		AC: toIntSafe(record.ac) ?? toIntSafe(record.ac_class) ?? 0,
		HP: toStringSafe(record.hp) ?? '',
		HitDice: optionalString(record.hit_dice),
		Speed: optionalString(record.speed),
		Stats: toStatsArray(record.stats),
		AbilitySaves: toNamedAbilityList(record.saves),
		ProficientSkills: toNamedAbilityList(record.skillsaves),
		DamageVulnerabilities: optionalString(record.damage_vulnerabilities),
		DamageResistances: optionalString(record.damage_resistances),
		DamageImmunities: optionalString(record.damage_immunities),
		ConditionImmunities: optionalString(record.condition_immunities),
		Senses: optionalString(record.senses),
		Languages: optionalString(record.languages),
		CR: toStringSafe(record.cr),
		Spells: Array.isArray(record.spells)
			? record.spells.filter((entry): entry is string => typeof entry === 'string')
			: [],
		Traits: [...toNamedAbilityList(record.traits), ...extraTraits(record)],
		Actions: toNamedAbilityList(record.actions),
		LegendaryActions: legendaryActions(record),
		BonusActions: toNamedAbilityList(record.bonus_actions),
		Reactions: toNamedAbilityList(record.reactions),
	};

	// Carried through so a re-send updates rather than duplicating. Guarded
	// because the source `id` is often the plugin's own, which is not a GUID and
	// would fail model binding.
	const id = record.id;
	if (typeof id === 'string' && UUID_PATTERN.test(id)) {
		payload.Id = id;
	}

	return payload;
}
