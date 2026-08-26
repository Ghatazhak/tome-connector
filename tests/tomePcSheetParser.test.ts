import { describe, expect, it } from 'vitest';
import { cleanCell, findTable, parsePcSheet, splitSections, stripFrontmatter } from '../src/tomePcSheetParser';

/**
 * A trimmed copy of a real D&D Beyond export (Zabadun Stoneheart, a level 3
 * dwarf barbarian) - a martial character, so no Spells, Equipment or Features
 * sections exist at all. That absence is the point: the exporter omits an empty
 * section rather than writing an empty one.
 */
const MARTIAL_NOTE = `---
name: Zabadun Stoneheart
race: Dwarf
class: Barbarian 3
level: 3
---

# Zabadun Stoneheart

## Core Stats

| HP | AC | Speed | Initiative | Proficiency Bonus |
|:---:|:---:|:---:|:---:|:---:|
| 43 / 43 | 19 | 30 ft | +2 | +2 |

## Saving Throws

| STR | DEX | CON | INT | WIS | CHA |
|:---:|:---:|:---:|:---:|:---:|:---:|
| **+7** ✓ <span style="color:#22c55e;font-weight:700;">▲A</span> | +2 <span style="color:#22c55e;font-weight:700;">▲A</span> | **+5** ✓ <span style="color:#22c55e;font-weight:700;">▲A</span> | +1 <span style="color:#22c55e;font-weight:700;">▲A</span> | +1 <span style="color:#22c55e;font-weight:700;">▲A</span> | +1 <span style="color:#22c55e;font-weight:700;">▲A</span> |

## Skills

| Skill | Stat | Bonus |
|:---|:---:|:---:|
| Acrobatics ✓ | DEX | +4 <span style="color:#9ca3af;">–N</span> |
| Arcana | INT | +1 <span style="color:#9ca3af;">–N</span> |
| Athletics ★ | STR | +9 <span style="color:#9ca3af;">–N</span> |
| Perception ✓ | WIS | +3 <span style="color:#9ca3af;">–N</span> |

## Proficiencies & Languages

**Languages:** Common, Dwarvish, Goblin

**Armor:** Light Armor, Medium Armor

**Weapons:** Simple Weapons, Martial Weapons

## Currency

| CP | SP | EP | GP | PP |
|:---:|:---:|:---:|:---:|:---:|
| 10 | 54 | 0 | 66 | 0 |

## Actions & Attacks

| Name | ATK Bonus | Damage | Range | Notes |
|:---|:---:|:---|:---:|:---|
| ⚔️ Unarmed Strike | +7 | 6 | 5 ft | Bludgeoning |

## Session Notes

*Add your notes here.*
`;

/** The caster half of the same exporter: spells by level, equipment, and features with sub-headings. */
const CASTER_NOTE = `## Equipment

| Item                    | Qty | Equipped |  Weight  |
| :---------------------- | :-: | :------: | :------: |
| Dagger                  |  1  |    —     | 1.0 lbs  |
| Backpack                |  1  |    ✓     | 5.0 lbs  |
| Rations                 | 10  |    —     | 20.0 lbs |

## Actions & Attacks

| Name              | ATK Bonus | Damage | Range  | Notes       |
| :---------------- | :-------: | :----- | :----: | :---------- |
| ⚔️ Unarmed Strike |    +2     | 1      |  5 ft  | Bludgeoning |
| ✨ Sorcerous Burst |    +3     | —      | 120 ft | Evocation   |
|                   |           |        |        |             |

## Features & Traits

### Racial Traits

**Darkvision**
You have Darkvision with a range of 60 feet.

**Size**
You are Medium (about 5&ndash;6 feet tall).

### Feats

**Magic Initiate (Wizard)**
Origin Feat

You gain the following benefits.

## Spells

### Cantrips

| Spell | School | Cast Time | Range | Conc. | Prepared |
|:---|:---|:---|:---|:---:|:---:|
| **Sorcerous Burst** | Evocation | 1 Action | 120 ft | — | — |
| **Ray of Frost** | Evocation | 1 Action | 60 ft | — | — |
| **Ray of Frost** | Evocation | 1 Action | 60 ft | — | — |

### 1st Level

| Spell | School | Cast Time | Range | Conc. | Prepared |
|:---|:---|:---|:---|:---:|:---:|
| **Shield** | Abjuration | 1 Reaction | 0 ft | — | ✓ |
`;

describe('stripFrontmatter', () => {
	it('drops a leading frontmatter block', () => {
		expect(stripFrontmatter('---\nname: X\n---\n# Title\n')).toBe('# Title\n');
	});

	it('leaves a note with no frontmatter alone', () => {
		expect(stripFrontmatter('# Title\n')).toBe('# Title\n');
	});
});

describe('cleanCell', () => {
	it('drops a span with its contents, so advantage markers never read as values', () => {
		expect(cleanCell('+4 <span style="color:#9ca3af;">–N</span>')).toBe('+4');
	});

	it('decodes html entities', () => {
		expect(cleanCell('5&ndash;6 feet')).toBe('5–6 feet');
	});

	it('removes bold markers', () => {
		expect(cleanCell('**+7** ✓')).toBe('+7 ✓');
	});
});

describe('findTable', () => {
	it('drops an all-empty trailing row', () => {
		const table = findTable([
			'| A | B |',
			'|:--|:--|',
			'| 1 | 2 |',
			'|   |   |',
		]);
		expect(table?.rows).toEqual([['1', '2']]);
	});

	it('returns null when there is no separator row', () => {
		expect(findTable(['| A | B |', '| 1 | 2 |'])).toBeNull();
	});
});

describe('splitSections', () => {
	it('nests h3 subsections under their h2', () => {
		const sections = splitSections(CASTER_NOTE);
		const spells = sections.find((section) => section.title === 'Spells');
		expect(spells?.subsections.map((sub) => sub.title)).toEqual(['Cantrips', '1st Level']);
	});
});

describe('parsePcSheet - martial character', () => {
	const sheet = parsePcSheet(MARTIAL_NOTE);

	it('reads initiative, the one Core Stats value frontmatter lacks', () => {
		expect(sheet.Initiative).toBe(2);
	});

	it('reads all six saves with their proficiency', () => {
		expect(sheet.Saves).toEqual([
			{ Ability: 'STR', Bonus: 7, Proficient: true },
			{ Ability: 'DEX', Bonus: 2, Proficient: false },
			{ Ability: 'CON', Bonus: 5, Proficient: true },
			{ Ability: 'INT', Bonus: 1, Proficient: false },
			{ Ability: 'WIS', Bonus: 1, Proficient: false },
			{ Ability: 'CHA', Bonus: 1, Proficient: false },
		]);
	});

	it('separates expertise from plain proficiency', () => {
		expect(sheet.Skills).toContainEqual({
			Name: 'Athletics',
			Ability: 'STR',
			Bonus: 9,
			Proficient: true,
			Expertise: true,
		});
		expect(sheet.Skills).toContainEqual({
			Name: 'Acrobatics',
			Ability: 'DEX',
			Bonus: 4,
			Proficient: true,
			Expertise: false,
		});
	});

	it('keeps unproficient skills, which is what makes a passive score correct', () => {
		expect(sheet.Skills.find((skill) => skill.Name === 'Arcana')).toEqual({
			Name: 'Arcana',
			Ability: 'INT',
			Bonus: 1,
			Proficient: false,
			Expertise: false,
		});
	});

	it('reads the labelled proficiency lines', () => {
		expect(sheet.Languages).toBe('Common, Dwarvish, Goblin');
		expect(sheet.ArmorProficiencies).toBe('Light Armor, Medium Armor');
		expect(sheet.WeaponProficiencies).toBe('Simple Weapons, Martial Weapons');
	});

	it('reads currency', () => {
		expect(sheet.Currency).toEqual({ Cp: 10, Sp: 54, Ep: 0, Gp: 66, Pp: 0 });
	});

	it('strips the emoji badge from an attack name', () => {
		expect(sheet.Attacks).toEqual([
			{ Name: 'Unarmed Strike', AttackBonus: '+7', Damage: '6', Range: '5 ft', Notes: 'Bludgeoning' },
		]);
	});

	it('returns empty lists for the sections a martial character has none of', () => {
		expect(sheet.Spells).toEqual([]);
		expect(sheet.Equipment).toEqual([]);
		expect(sheet.Features).toEqual([]);
	});
});

describe('parsePcSheet - caster', () => {
	const sheet = parsePcSheet(CASTER_NOTE);

	it('files spells under the level of their sub-heading', () => {
		expect(sheet.Spells.map((spell) => [spell.Name, spell.Level])).toEqual([
			['Sorcerous Burst', 0],
			['Ray of Frost', 0],
			['Shield', 1],
		]);
	});

	it('deduplicates a spell the exporter listed twice', () => {
		expect(sheet.Spells.filter((spell) => spell.Name === 'Ray of Frost')).toHaveLength(1);
	});

	it('reads the prepared tick', () => {
		expect(sheet.Spells.find((spell) => spell.Name === 'Shield')?.Prepared).toBe(true);
		expect(sheet.Spells.find((spell) => spell.Name === 'Sorcerous Burst')?.Prepared).toBe(false);
	});

	it('keeps features under the sub-heading they were listed beneath', () => {
		expect(sheet.Features).toEqual([
			{ Category: 'Racial Traits', Name: 'Darkvision', Desc: 'You have Darkvision with a range of 60 feet.' },
			{ Category: 'Racial Traits', Name: 'Size', Desc: 'You are Medium (about 5–6 feet tall).' },
			{
				Category: 'Feats',
				Name: 'Magic Initiate (Wizard)',
				Desc: 'Origin Feat\n\nYou gain the following benefits.',
			},
		]);
	});

	it('reads equipment quantities and the equipped tick', () => {
		expect(sheet.Equipment).toEqual([
			{ Name: 'Dagger', Quantity: 1, Weight: '1.0 lbs', Equipped: false },
			{ Name: 'Backpack', Quantity: 1, Weight: '5.0 lbs', Equipped: true },
			{ Name: 'Rations', Quantity: 10, Weight: '20.0 lbs', Equipped: false },
		]);
	});

	it('drops the exporter\'s blank trailing attack row', () => {
		expect(sheet.Attacks.map((attack) => attack.Name)).toEqual([
			'Unarmed Strike',
			'Sorcerous Burst',
		]);
	});

	it('omits an absent currency table rather than inventing an empty purse', () => {
		expect(sheet.Currency).toBeUndefined();
	});
});
