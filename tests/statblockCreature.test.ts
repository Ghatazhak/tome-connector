import { describe, expect, it } from 'vitest';

import {
	hasInlineStats,
	mapToNpcPayload,
	mergeCreature,
	normalizeName,
	normalizeSaves,
	normalizeSkillSaves,
	toIntSafe,
	toStatsArray,
	type Dnd5eCreature
} from '../src/recognizers/statblockCreature';

/**
 * Fixtures are the real thing.
 *
 * Every record below is copied from `ttrpg-convert-cli` output in
 * `C:\TTRPGCLI\bin\dm\3-Mechanics\CLI\bestiary`, with the YAML already parsed -
 * which is where the seam is, so no YAML parser is needed here. Inventing
 * plausible-looking statblocks instead would have missed `ac_class`, `gear` and
 * `legendary_description` entirely, none of which the mapper handled before.
 */

/** `bestiary/aberration/githyanki-knight-xmm.md` — gear, saves, no legendary actions. */
const githyankiKnight = {
	name: 'Githyanki Knight (XMM)',
	size: 'Medium',
	type: 'aberration',
	subtype: 'gith',
	alignment: 'Lawful Evil',
	ac: 18,
	hp: 117,
	hit_dice: '18d8 + 36',
	modifier: 5,
	stats: [16, 14, 15, 14, 14, 15],
	speed: '30 ft.',
	saves: [{ constitution: 5 }, { intelligence: 5 }, { wisdom: 5 }],
	gear: ['[plate armor](3-Mechanics/CLI/items/plate-armor-xphb.md)'],
	senses: 'passive Perception 12',
	languages: 'Common, Gith',
	cr: '8',
	actions: [{ desc: 'The githyanki makes three Silver Sword attacks.', name: 'Multiattack' }],
	bonus_actions: [{ desc: 'The githyanki casts Misty Step.', name: 'Misty Step (2/Day)' }],
	source: ['XMM'],
	image: '3-Mechanics/CLI/bestiary/aberration/token/githyanki-knight-xmm.webp'
};

/** `bestiary/aberration/aberrant-spirit-beholderkin-xphb.md` — a summon: formula AC, no `ac`. */
const aberrantSpirit = {
	name: 'Aberrant Spirit (Beholderkin) (XPHB)',
	size: 'Medium',
	type: 'aberration',
	alignment: 'Neutral',
	ac_class: "11 + the spell's level",
	hp: "40 + 10 for each spell level above 4",
	modifier: 0,
	stats: [16, 10, 15, 16, 10, 6],
	speed: '30 ft., fly 30 ft. (hover)',
	damage_immunities: 'psychic',
	senses: 'Darkvision 60 ft., passive Perception 10',
	languages: 'Deep Speech, understands the languages you know',
	actions: [{ desc: 'The spirit makes a number of attacks…', name: 'Multiattack' }],
	source: ['XPHB']
};

describe('toIntSafe', () => {
	it.each([
		[18, 18],
		['15 (natural armor)', 15],
		["11 + the spell's level", 11],
		['-2', -2],
		['none', undefined],
		[null, undefined]
	])('reads %o as %o', (input, expected) => {
		expect(toIntSafe(input)).toBe(expected);
	});
});

describe('toStatsArray', () => {
	it('accepts six numbers', () => {
		expect(toStatsArray([16, 14, 15, 14, 14, 15])).toEqual([16, 14, 15, 14, 14, 15]);
	});

	it('rejects a mixed array rather than sending partial ability scores', () => {
		expect(toStatsArray([16, '14', 15])).toBeUndefined();
	});
});

describe('normalizeName', () => {
	it('strips the source suffix the CLI appends', () => {
		expect(normalizeName('Githyanki Knight (XMM)')).toBe('Githyanki Knight');
	});

	/**
	 * Worth pinning because it is lossy and surprising: the sub-name lives in the
	 * same parentheses as the source, so both go. Two beholderkin variants collapse
	 * onto one library entry.
	 */
	it('also strips a parenthesised sub-name, which is lossy', () => {
		expect(normalizeName('Aberrant Spirit (Beholderkin) (XPHB)')).toBe('Aberrant Spirit');
	});
});

describe('normalizeSaves', () => {
	it('turns single-key objects into name/desc pairs with a signed modifier', () => {
		expect(normalizeSaves([{ constitution: 5 }, { intelligence: -1 }])).toEqual([
			{ name: 'Constitution', desc: '+5' },
			{ name: 'Intelligence', desc: '-1' }
		]);
	});

	it('drops the null placeholders Fantasy Statblocks leaves in skillsaves', () => {
		expect(normalizeSkillSaves([{ perception: 11 }, null])).toEqual([
			{ name: 'Perception', desc: '+11' }
		]);
	});
});

describe('hasInlineStats', () => {
	/** This is the predicate that decides whether the plugin is needed at all. */
	it('is true for a self-contained CLI statblock', () => {
		expect(hasInlineStats(githyankiKnight)).toBe(true);
	});

	it('is false for a bare bestiary reference, which cannot be rescued', () => {
		expect(hasInlineStats({ monster: 'Goblin', hp: 12 })).toBe(false);
	});
});

describe('mergeCreature', () => {
	it('lets the block override the bestiary', () => {
		const merged = mergeCreature({ name: 'Goblin', hp: 7, ac: 15 }, { hp: 12 });
		expect(merged.hp).toBe('12');
		expect(merged.ac).toBe(15);
	});

	it('stands the block alone when there is no bestiary', () => {
		const merged = mergeCreature(null, githyankiKnight);
		expect(merged.name).toBe('Githyanki Knight');
	});
});

describe('mapToNpcPayload', () => {
	/** The bag, asserted present, so each case reads the stat block rather than guarding it. */
	function bagOf(record: Record<string, unknown>): Dnd5eCreature {
		const bag = mapToNpcPayload(record).dnd5e;
		if (!bag) throw new Error('expected a dnd5e bag');
		return bag;
	}

	it('maps a real CLI creature into the dnd5e bag', () => {
		const payload = mapToNpcPayload(mergeCreature(null, githyankiKnight));

		expect(payload.name).toBe('Githyanki Knight');
		expect(payload.image).toBe('3-Mechanics/CLI/bestiary/aberration/token/githyanki-knight-xmm.webp');
		expect(payload.pf2e).toBeUndefined();

		const bag = bagOf(mergeCreature(null, githyankiKnight));
		expect(bag.size).toBe('Medium');
		expect(bag.type).toBe('aberration');
		expect(bag.subtype).toBe('gith');
		expect(bag.ac).toBe(18);
		expect(bag.hp).toBe('117');
		expect(bag.hitDice).toBe('18d8 + 36');
		expect(bag.stats).toEqual([16, 14, 15, 14, 14, 15]);
		expect(bag.cr).toBe('8');
		expect(bag.abilitySaves).toEqual([
			{ name: 'Constitution', desc: '+5' },
			{ name: 'Intelligence', desc: '+5' },
			{ name: 'Wisdom', desc: '+5' }
		]);
		expect(bag.bonusActions).toHaveLength(1);
	});

	/**
	 * The server refuses a body carrying any flat 5e field with `connector.outdated`, so the
	 * top level is the neutral fields and the bag, and nothing else.
	 */
	it('sends nothing of the stat block at the top level', () => {
		const payload = mapToNpcPayload(mergeCreature(null, githyankiKnight));
		expect(Object.keys(payload).sort()).toEqual(['dnd5e', 'image', 'name']);
	});

	/** 138 of the CLI's creatures are summons whose AC is a formula and have no `ac`. */
	it('falls back to ac_class when there is no ac', () => {
		expect(bagOf(aberrantSpirit).ac).toBe(11);
	});

	/**
	 * `gear` is on 131 creatures and the server models no such field. Folding it
	 * into a trait beats the previous behaviour, which was to drop it silently.
	 */
	it('keeps gear as a trait, with the markdown links flattened', () => {
		expect(bagOf(mergeCreature(null, githyankiKnight)).traits)
			.toContainEqual({ name: 'Gear', desc: 'plate armor' });
	});

	it('puts the legendary preamble at the head of the legendary actions', () => {
		const bag = bagOf({
			name: 'Aboleth',
			legendary_description: 'Legendary Action Uses: 3 (4 in Lair).',
			legendary_actions: [{ name: 'Lash', desc: 'The aboleth makes one attack.' }]
		});

		expect(bag.legendaryActions).toEqual([
			{ name: 'Legendary Actions', desc: 'Legendary Action Uses: 3 (4 in Lair).' },
			{ name: 'Lash', desc: 'The aboleth makes one attack.' }
		]);
	});

	it('does not invent a legendary heading when there are no legendary actions', () => {
		expect(bagOf({ name: 'X', legendary_description: 'Unused' }).legendaryActions).toEqual([]);
	});

	it('drops fields the server does not model rather than sending them', () => {
		const payload = mapToNpcPayload(mergeCreature(null, githyankiKnight));
		for (const where of [payload, payload.dnd5e]) {
			expect(where).not.toHaveProperty('modifier');
			expect(where).not.toHaveProperty('source');
			expect(where).not.toHaveProperty('gear');
		}
	});

	/** The plugin's own id is not a GUID and would fail model binding server-side. */
	it('forwards only a GUID id', () => {
		expect(mapToNpcPayload({ name: 'X', id: 'goblin-1' })).not.toHaveProperty('id');
		expect(
			mapToNpcPayload({ name: 'X', id: '3e8f6c30-0000-4000-8c00-000000000001' }).id
		).toBe('3e8f6c30-0000-4000-8c00-000000000001');
	});
});