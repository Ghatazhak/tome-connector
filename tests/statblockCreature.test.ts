import { describe, expect, it } from 'vitest';

import {
	hasInlineStats,
	mapToNpcPayload,
	mergeCreature,
	normalizeName,
	normalizeSaves,
	normalizeSkillSaves,
	toIntSafe,
	toStatsArray
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
	it('maps a real CLI creature', () => {
		const payload = mapToNpcPayload(mergeCreature(null, githyankiKnight));

		expect(payload.Name).toBe('Githyanki Knight');
		expect(payload.AC).toBe(18);
		expect(payload.HP).toBe('117');
		expect(payload.HitDice).toBe('18d8 + 36');
		expect(payload.Stats).toEqual([16, 14, 15, 14, 14, 15]);
		expect(payload.CR).toBe('8');
		expect(payload.AbilitySaves).toEqual([
			{ Name: 'Constitution', Desc: '+5' },
			{ Name: 'Intelligence', Desc: '+5' },
			{ Name: 'Wisdom', Desc: '+5' }
		]);
		expect(payload.BonusActions).toHaveLength(1);
	});

	/** 138 of the CLI's creatures are summons whose AC is a formula and have no `ac`. */
	it('falls back to ac_class when there is no ac', () => {
		expect(mapToNpcPayload(aberrantSpirit).AC).toBe(11);
	});

	/**
	 * `gear` is on 131 creatures and the server models no such field. Folding it
	 * into a trait beats the previous behaviour, which was to drop it silently.
	 */
	it('keeps gear as a trait, with the markdown links flattened', () => {
		const payload = mapToNpcPayload(mergeCreature(null, githyankiKnight));
		expect(payload.Traits).toContainEqual({ Name: 'Gear', Desc: 'plate armor' });
	});

	it('puts the legendary preamble at the head of the legendary actions', () => {
		const payload = mapToNpcPayload({
			name: 'Aboleth',
			legendary_description: 'Legendary Action Uses: 3 (4 in Lair).',
			legendary_actions: [{ name: 'Lash', desc: 'The aboleth makes one attack.' }]
		});

		expect(payload.LegendaryActions).toEqual([
			{ Name: 'Legendary Actions', Desc: 'Legendary Action Uses: 3 (4 in Lair).' },
			{ Name: 'Lash', Desc: 'The aboleth makes one attack.' }
		]);
	});

	it('does not invent a legendary heading when there are no legendary actions', () => {
		expect(mapToNpcPayload({ name: 'X', legendary_description: 'Unused' }).LegendaryActions)
			.toEqual([]);
	});

	it('drops fields the server does not model rather than sending them', () => {
		const payload = mapToNpcPayload(mergeCreature(null, githyankiKnight));
		expect(payload).not.toHaveProperty('modifier');
		expect(payload).not.toHaveProperty('source');
		expect(payload).not.toHaveProperty('gear');
	});

	/** The plugin's own id is not a GUID and would fail model binding server-side. */
	it('forwards only a GUID id', () => {
		expect(mapToNpcPayload({ name: 'X', id: 'goblin-1' })).not.toHaveProperty('Id');
		expect(
			mapToNpcPayload({ name: 'X', id: '3e8f6c30-0000-4000-8c00-000000000001' }).Id
		).toBe('3e8f6c30-0000-4000-8c00-000000000001');
	});
});
