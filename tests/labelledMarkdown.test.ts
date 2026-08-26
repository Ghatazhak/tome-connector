import { describe, expect, it } from 'vitest';

import {
	labelMap,
	normaliseLabel,
	withoutFrontmatter,
	parseLabelledValues,
	parseSections,
	preamble,
	sectionsAtLevel
} from '../src/recognizers/labelledMarkdown';

/**
 * Fixtures are lifted from real `ttrpg-convert-cli` output, because the whole
 * reason this prose is parseable is that a template wrote it - and the details
 * that make it awkward are details a made-up sample would smooth over. The
 * separator moves by content type, and species and feats write their *traits* in
 * the same shape as their fields.
 */

/** `races/aasimar-xphb.md`, trimmed. */
const aasimar = `---
cssclasses:
- json5e-race
---
# Aasimar
*Source: Player's Handbook (2024) p. 186*
![](3-Mechanics/CLI/races/img/aasimar.webp#right)

- **Ability Scores**: None
- **Type**: humanoid
- **Size**: Small or Medium
- **Speed**: 30 ft.
- **Spellcasting**: Charisma

## Traits

### Celestial Resistance

You have [Resistance](3-Mechanics/CLI/rules/variant-rules/resistance-xphb.md) to Necrotic damage and Radiant damage.

### Darkvision

You have [Darkvision](3-Mechanics/CLI/rules/senses.md#Darkvision) with a range of 60 feet.`;

/** `backgrounds/acolyte-xphb.md`, trimmed. Note the period inside the bold. */
const acolyte = `# Acolyte
*Source: Player's Handbook (2024) p. 178. Available in the SRD*

- **Ability Scores.** Intelligence, Wisdom, Charisma
- **Feat.** [Magic Initiate](3-Mechanics/CLI/feats/magic-initiate-xphb.md) (Cleric)
- **Skill Proficiencies.** [Insight](3-Mechanics/CLI/rules/skills.md#Insight), [Religion](3-Mechanics/CLI/rules/skills.md#Religion)
- **Equipment.** Choose A or B: (A) [Calligrapher's Supplies](3-Mechanics/CLI/items/calligraphers-supplies-xphb.md), 8 GP; or (B) 50 GP

You devoted yourself to service in a temple.`;

/** `spells/acid-splash-xphb.md`, trimmed. Colon inside the bold; Classes unbulleted. */
const acidSplash = `# Acid Splash
*cantrip, Evocation*

- **Casting time:** 1 Action
- **Range:** 60 feet
- **Components:** V, S
- **Duration:** Instantaneous

You create an acidic bubble.

**Classes**: Sorcerer, Wizard`;

describe('normaliseLabel', () => {
	it.each([
		['Casting time:', 'casting time'],
		['Ability Scores.', 'ability scores'],
		['Skill  Proficiencies', 'skill proficiencies'],
		['Type', 'type']
	])('%s -> %s', (input, expected) => {
		expect(normaliseLabel(input)).toBe(expected);
	});
});

describe('parseLabelledValues', () => {
	it('reads the colon-outside-bold style species use', () => {
		const map = labelMap(preamble(aasimar));

		expect(map.get('size')).toBe('Small or Medium');
		expect(map.get('speed')).toBe('30 ft.');
		expect(map.get('type')).toBe('humanoid');
		expect(map.get('ability scores')).toBe('None');
	});

	it('reads the period-inside-bold style backgrounds use', () => {
		const map = labelMap(acolyte);

		expect(map.get('ability scores')).toBe('Intelligence, Wisdom, Charisma');
		expect(map.get('tool proficiency')).toBeUndefined();
	});

	it('reads the colon-inside-bold style spells use', () => {
		const map = labelMap(acidSplash);

		expect(map.get('casting time')).toBe('1 Action');
		expect(map.get('range')).toBe('60 feet');
		expect(map.get('duration')).toBe('Instantaneous');
	});

	it('reads an unbulleted label, which is how spells write Classes', () => {
		expect(labelMap(acidSplash).get('classes')).toBe('Sorcerer, Wizard');
	});

	/** The CLI links every skill, item and rule it mentions. */
	it('flattens the markdown links out of a value', () => {
		expect(labelMap(acolyte).get('skill proficiencies')).toBe('Insight, Religion');
		expect(labelMap(acolyte).get('feat')).toBe('Magic Initiate (Cleric)');
	});

	it('keeps the awkward punctuation inside an equipment choice', () => {
		expect(labelMap(acolyte).get('equipment')).toContain('Choose A or B');
		expect(labelMap(acolyte).get('equipment')).toContain('50 GP');
	});

	/**
	 * A species writes its traits in the same shape as its fields, so a caller
	 * that treated every bold line as data would invent a `storm's thunder` stat.
	 * Restricting to the preamble is how that is avoided, and this pins that the
	 * parser itself does not try to be clever about it.
	 */
	it('returns trait-shaped lines too, leaving the choice to the caller', () => {
		const all = parseLabelledValues("- **Size**: Medium\n\n## Traits\n\n- **Storm's Thunder.** You retaliate.");

		expect(all.map((entry) => entry.label)).toEqual(['size', "storm's thunder"]);
	});

	it('ignores bold text that is not at the start of a line', () => {
		expect(parseLabelledValues('You have **Resistance** to fire.')).toEqual([]);
	});

	it('keeps the first value when a label repeats', () => {
		expect(labelMap('- **Range**: 60 feet\n- **Range**: 120 feet').get('range')).toBe('60 feet');
	});
});

describe('parseSections', () => {
	it('splits on headings and nests children inside their parent', () => {
		const sections = parseSections(aasimar);
		const traits = sections.find((section) => section.title === 'Traits');

		expect(traits?.level).toBe(2);
		// The parent keeps its children's text, so a caller can take the whole block.
		expect(traits?.body).toContain('Celestial Resistance');
		expect(traits?.body).toContain('Darkvision');
	});

	it('gives each trait its own section with just its prose', () => {
		const traits = sectionsAtLevel(aasimar, 3);

		expect(traits.map((section) => section.title)).toEqual([
			'Celestial Resistance',
			'Darkvision'
		]);
		expect(traits[1]?.body).toContain('range of 60 feet');
		expect(traits[1]?.body).not.toContain('Celestial Resistance');
	});

	it('finds nothing in a note with no headings', () => {
		expect(parseSections('Just prose.')).toEqual([]);
	});
});

describe('preamble', () => {
	/**
	 * Where the field list lives: under the `# Title` and above the first `##`.
	 * Reading the whole note would also collect the trait names.
	 */
	it('takes the text between the title and the first section', () => {
		const text = preamble(aasimar);

		expect(text).toContain('**Size**: Small or Medium');
		expect(text).not.toContain('Celestial Resistance');
	});

	it('is the whole note when there are no sections', () => {
		expect(preamble('# Feat\n\n**Prerequisite**: 4th')).toContain('Prerequisite');
	});
});

describe('withoutFrontmatter', () => {
	/**
	 * Callers pass a note's whole text, because that is what Obsidian's `read`
	 * returns. Every CLI note opens with frontmatter, so leaving it in put
	 * `cssclasses: json5e-feat` at the top of each imported feat's description -
	 * which is how this was found.
	 */
	it('drops a leading frontmatter block', () => {
		const body = withoutFrontmatter('---\ncssclasses:\n- json5e-feat\n---\n# Alert\n\nProse.');

		expect(body).toBe('# Alert\n\nProse.');
	});

	/** A thematic break is not frontmatter, and neither is a `---` further down. */
	it.each([
		['No frontmatter.\n\n---\n\nMore.'],
		['# Title\n\n---\n\nProse.'],
	])('leaves %o alone', (markdown) => {
		expect(withoutFrontmatter(markdown)).toBe(markdown);
	});

	/**
	 * An unterminated block is not frontmatter either - dropping to the end of the
	 * note would silently discard the whole thing.
	 */
	it('leaves an unclosed block alone', () => {
		expect(withoutFrontmatter('---\ntags: x\n\n# Title')).toBe('---\ntags: x\n\n# Title');
	});

	/** A YAML comment would otherwise be read as a heading. */
	it('keeps a commented frontmatter line out of the sections', () => {
		const sections = parseSections('---\n# a comment\ntags: x\n---\n## Real\n\nBody.');

		expect(sections.map((section) => section.title)).toEqual(['Real']);
	});
});
