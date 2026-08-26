import { describe, expect, it } from 'vitest';

import { parseEquipmentItem, readCost, readWeight } from '../src/recognizers/compendium/equipmentItem';

/** `items/rope-xphb.md`, trimmed but structurally exact. */
const rope = `---
cssclasses:
- json5e-item
tags:
- ttrpg-cli/item/gear/
- ttrpg-cli/item/rarity/none
aliases:
- "Rope"
---
# Rope
*Adventuring gear*

- **Cost**: 1 gp
- **Weight**: 5.0 lbs.

As a [Utilize](3-Mechanics/CLI/rules/actions.md#Utilize) action, you can tie a knot with Rope if you succeed on a DC 10 Dexterity check.

*Source: Player's Handbook (2024) p. 228*`;

/** `items/candle-xphb.md`: priced in copper, and light enough the book gives it no weight line at all. */
const candle = `---
tags:
- ttrpg-cli/item/gear/
- ttrpg-cli/item/rarity/none
---
# Candle
*Adventuring gear*

- **Cost**: 1 cp

For 1 hour, a lit Candle sheds light in a 5-foot radius.

*Source: Player's Handbook (2024) p. 224*`;

describe('readCost', () => {
	it.each([
		['- **Cost**: 1 gp', 1],
		['- **Cost**: 2 cp', 0.02],
		['- **Cost**: 5 sp', 0.5],
		['- **Cost**: 5,000 gp', 5000],
	])('%s -> %d gp', (text, expected) => {
		expect(readCost(text)).toBe(expected);
	});

	/** The one note in the corpus priced in more than one denomination. */
	it('sums a compound price', () => {
		expect(readCost('- **Cost**: 1 sp, 5 cp')).toBe(0.15);
	});

	it('is null when there is no cost line', () => {
		expect(readCost('*Adventuring gear*\n\n- **Weight**: 1.0 lbs.')).toBeNull();
	});
});

describe('readWeight', () => {
	it('reads the figure before "lbs."', () => {
		expect(readWeight('- **Weight**: 5.0 lbs.')).toBe(5);
	});

	/** The corpus omits the line entirely for a handful of negligible items. */
	it('is null when there is no weight line', () => {
		expect(readWeight('- **Cost**: 1 cp')).toBeNull();
	});
});

describe('parseEquipmentItem', () => {
	const parsed = parseEquipmentItem(rope, 'rope-xphb', 'Rope');

	it('reads every field the library holds', () => {
		expect(parsed).toMatchObject({
			name: 'Rope',
			category: 'Adventuring gear',
			cost: 1,
			weight: 5,
			sourceKey: 'rope-xphb',
			imagePath: null,
		});
	});

	it('takes the rules text and nothing else', () => {
		expect(parsed.desc).toContain('tie a knot with Rope');
		for (const leak of ['Adventuring gear', 'Cost', 'Weight', 'Source:']) {
			expect(parsed.desc).not.toContain(leak);
		}
	});

	it('leaves weight null when the note gives none', () => {
		const withCandle = parseEquipmentItem(candle, 'candle-xphb', 'Candle');
		expect(withCandle.cost).toBe(0.01);
		expect(withCandle.weight).toBeNull();
	});

	/** Always succeeds - the caller has already ruled out magic before reaching here. */
	it('falls back to the given name when the note has no title', () => {
		const untitled = parseEquipmentItem('*Adventuring gear*\n\nProse.', 'k', 'Fallback');
		expect(untitled.name).toBe('Fallback');
	});
});
