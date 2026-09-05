import { describe, expect, it } from 'vitest';

import {
	isPf2eCreature,
	mapToPf2eCreature,
	toAttributes,
	toSkills,
	toSpeeds,
	toStrikes,
} from '../src/recognizers/pf2eCreature';
import { hasInlineStats, mapToNpcPayload } from '../src/recognizers/statblockCreature';

/**
 * A Goblin Warrior in the vocabulary of the plugin's own
 * `Pathfinder 2e Creature Layout.json`, which is where every key here comes from.
 *
 * The numbers are Monster Core's. What matters for these tests is the *shape*: Perception
 * under `modifier`, the six modifiers under `attributes`, and the three ability slots kept
 * apart - all three of which the obvious guess gets wrong.
 */
const GOBLIN: Record<string, unknown> = {
	layout: 'Pathfinder 2e Creature Layout',
	name: 'Goblin Warrior',
	level: 'Creature -1',
	rarity: 'Common',
	size: 'small',
	traits: ['goblin', 'humanoid'],
	modifier: 2,
	senses: 'darkvision',
	languages: 'Common, Goblin',
	skills: [{ Acrobatics: '+5' }, { Athletics: '+2' }, { Stealth: '+5' }],
	attributes: [{ str: 0 }, { dex: 3 }, { con: 1 }, { int: 0 }, { wis: 0 }, { cha: 1 }],
	items: ['dogslicer', 'leather armor'],
	ac: 16,
	acNote: '14 when off-guard',
	saves: [{ fort: '+5' }, { ref: '+7' }, { will: '+3' }],
	hp: 6,
	immunities: 'fire',
	weaknesses: 'cold iron 2',
	speed: '25 feet, climb 15 feet',
	abilities_top: [{ name: 'Darkvision', desc: 'Sees in the dark.' }],
	abilities_mid: [{ name: 'Goblin Scuttle', desc: 'Step in reaction to an ally moving nearby.' }],
	abilities_bot: [{ name: 'Sneak Attack', desc: 'Deals extra damage to an off-guard target.' }],
	attacks: [
		{ name: 'Melee', desc: 'dogslicer +8 (agile, backstabber, finesse), Damage 1d6+1 slashing' },
		{ name: 'Ranged', desc: 'shortbow +8 (deadly d10, range increment 60 feet)' },
	],
	sourcebook: 'Pathfinder Monster Core',
};

describe('isPf2eCreature', () => {
	it('recognises a block by its layout', () => {
		expect(isPf2eCreature({ layout: 'Basic Pathfinder 2e Layout', name: 'Goblin' })).toBe(true);
	});

	// The two are not `&&`: a note saying one and not the other is still a Pathfinder note.
	it('recognises a block by its six ability modifiers alone', () => {
		expect(isPf2eCreature({ attributes: GOBLIN.attributes })).toBe(true);
	});

	it('leaves a D&D block alone', () => {
		expect(isPf2eCreature({ name: 'Goblin', stats: [8, 14, 10, 10, 8, 8] })).toBe(false);
	});

	// Otherwise anything with an `attributes` key becomes a creature with four zeroes.
	it('will not take a partial set of modifiers for a creature', () => {
		expect(isPf2eCreature({ attributes: { str: 1, dex: 2 } })).toBe(false);
		expect(toAttributes({ str: 1, dex: 2 })).toBeNull();
	});
});

describe('the shapes the layout allows', () => {
	// The plugin's `saves` block renders either shape, so both are read.
	it('reads a keyed block as a record or as a list of single-key objects', () => {
		expect(toAttributes({ str: 0, dex: 3, con: 1, int: 0, wis: 0, cha: 1 }))
			.toEqual({ str: 0, dex: 3, con: 1, int: 0, wis: 0, cha: 1 });
		expect(toAttributes(GOBLIN.attributes))
			.toEqual({ str: 0, dex: 3, con: 1, int: 0, wis: 0, cha: 1 });
	});

	it('accepts the spelled-out attribute names too', () => {
		expect(toAttributes({
			strength: 4, dexterity: 1, constitution: 3,
			intelligence: -2, wisdom: 0, charisma: -1,
		})).toEqual({ str: 4, dex: 1, con: 3, int: -2, wis: 0, cha: -1 });
	});

	it('splits a speed line into the movements the server models', () => {
		expect(toSpeeds('25 feet, climb 15 feet').speeds)
			.toEqual([{ type: 'land', feet: 25 }, { type: 'climb', feet: 15 }]);
	});

	// What could not be parsed is kept rather than dropped - a speed with a condition on it
	// is a real thing a GM reads.
	it('keeps what it cannot split as a note', () => {
		const { speeds, note } = toSpeeds('30 feet, swim 20 feet in water only');

		expect(speeds).toEqual([{ type: 'land', feet: 30 }]);
		expect(note).toBe('swim 20 feet in water only');
	});

	it('titles a skill and reads its modifier', () => {
		expect(toSkills([{ Acrobatics: '+5' }, { stealth: '+9' }]))
			.toEqual([{ name: 'Acrobatics', mod: 5, note: null }, { name: 'Stealth', mod: 9, note: null }]);
	});

	it('reads a strike\'s bonus and keeps the whole line', () => {
		const [melee, ranged] = toStrikes(GOBLIN.attacks);

		expect(melee.kind).toBe('melee');
		expect(melee.bonus).toBe(8);
		expect(melee.text).toContain('1d6+1 slashing');
		expect(ranged.kind).toBe('ranged');
	});
});

describe('mapToPf2eCreature', () => {
	const goblin = mapToPf2eCreature(GOBLIN);

	it('reads Perception off `modifier`, which is where the layout puts it', () => {
		expect(goblin.perception).toBe(2);
	});

	it('reads a negative level out of the printed word', () => {
		expect(goblin.level).toBe(-1);
	});

	it('keeps the three ability slots apart, as the stat block prints them', () => {
		expect(goblin.abilities.map((ability) => [ability.name, ability.category])).toEqual([
			['Darkvision', 'passive'],
			['Goblin Scuttle', 'defensive'],
			['Sneak Attack', 'offensive'],
		]);
	});

	it('carries the saves, the notes and the lists', () => {
		expect([goblin.fortitude, goblin.reflex, goblin.will]).toEqual([5, 7, 3]);
		expect(goblin.acNote).toBe('14 when off-guard');
		expect(goblin.immunities).toEqual(['fire']);
		expect(goblin.weaknesses).toEqual(['cold iron 2']);
		expect(goblin.languages).toEqual(['Common', 'Goblin']);
		expect(goblin.items).toEqual(['dogslicer', 'leather armor']);
	});

	it('capitalises the size, which the token placement column also carries', () => {
		expect(goblin.size).toBe('Small');
	});

	it('credits the book', () => {
		expect(goblin.source).toBe('Pathfinder Monster Core');
		expect(goblin.key).toBe('goblin-warrior');
	});

	// A Pathfinder spellcasting entry is ranks of slots and a DC held as prose. A bag with a
	// name and no spells in it would read as a caster who has forgotten every spell.
	it('leaves spellcasting empty rather than half-parsed', () => {
		expect(mapToPf2eCreature({ ...GOBLIN, spellcasting: [{ name: 'Arcane Innate Spells' }] })
			.spellcasting).toEqual([]);
	});
});

describe('the payload the endpoint receives', () => {
	const payload = mapToNpcPayload(GOBLIN);

	it('sends the stat block in the bag and leaves the 5e columns alone', () => {
		expect(payload.Pf2e).toBeDefined();
		expect(payload.Stats).toBeUndefined();
		expect(payload.Traits).toBeUndefined();
		expect(payload.Actions).toBeUndefined();
	});

	it('fills the neutral columns the board and the library read', () => {
		expect(payload.Name).toBe('Goblin Warrior');
		expect(payload.Size).toBe('Small');
		expect(payload.AC).toBe(16);
		// A string, because the 5e model types it as one - and filled, because a creature
		// arriving with an empty one lands on the board untracked.
		expect(payload.HP).toBe('6');
		// The level, in the column the 5e half puts a challenge rating in: both are the
		// library's difficulty axis, and the client draws whichever its ruleset names.
		expect(payload.CR).toBe('-1');
	});

	it('still maps a D&D block the way it always did', () => {
		const dnd = mapToNpcPayload({ name: 'Goblin', stats: [8, 14, 10, 10, 8, 8], ac: 15, hp: '7 (2d6)' });

		expect(dnd.Pf2e).toBeUndefined();
		expect(dnd.Stats).toEqual([8, 14, 10, 10, 8, 8]);
	});
});

describe('hasInlineStats', () => {
	// A Pathfinder note that stands alone is no more in need of the bestiary than a D&D one.
	it('counts a Pathfinder block as self-sufficient', () => {
		expect(hasInlineStats(GOBLIN)).toBe(true);
	});

	it('still counts a D&D block by its six ability scores', () => {
		expect(hasInlineStats({ stats: [8, 14, 10, 10, 8, 8] })).toBe(true);
		expect(hasInlineStats({ monster: 'Goblin' })).toBe(false);
	});
});
