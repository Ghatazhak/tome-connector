import { describe, expect, it } from 'vitest';

import {
	groupEntities,
	groupImages,
	setAllEntities,
	setAllImages,
	summariseImport,
} from '../src/adventure/adventureReviewRows';
import type { AdventurePlan, PlannedEntity, PlannedImage } from '../src/adventure/adventurePlan';

function entity(overrides: Partial<PlannedEntity> = {}): PlannedEntity {
	return {
		key: 'bestiary/goblin.md',
		label: 'Goblin',
		tomeName: 'Goblin',
		occurrences: 1,
		suggested: { to: 'NonPlayerCharacter' },
		chosen: { to: 'NonPlayerCharacter' },
		resolvedId: null,
		...overrides,
	};
}

function image(overrides: Partial<PlannedImage> = {}): PlannedImage {
	return {
		key: 'maps/room-1.webp',
		label: 'Room 1',
		dmPath: 'maps/room-1.webp',
		playerPath: null,
		suggested: { to: 'Map' },
		chosen: { to: 'Map' },
		resolvedId: null,
		...overrides,
	};
}

describe('groupEntities', () => {
	it('groups by suggested destination, in creatures/items/equipment/unrecognised order', () => {
		const goblin = entity();
		const item = entity({
			key: 'items/potion.md',
			suggested: { to: 'MagicItem' },
			chosen: { to: 'MagicItem' },
		});
		const rope = entity({
			key: 'items/rope.md',
			suggested: { to: 'EquipmentItem' },
			chosen: { to: 'EquipmentItem' },
		});
		const rules = entity({
			key: 'items/mystery.md',
			suggested: { to: 'skip' },
			chosen: { to: 'skip' },
		});

		const groups = groupEntities([rules, rope, item, goblin]);

		expect(groups.map((group) => group.key)).toEqual(['NonPlayerCharacter', 'MagicItem', 'EquipmentItem', 'skip']);
		expect(groups[0]?.items).toEqual([goblin]);
		expect(groups[2]?.label).toBe('equipment');
		expect(groups[3]?.label).toBe('not recognised');
	});

	it('omits an empty group rather than showing it with a zero count', () => {
		const groups = groupEntities([entity()]);
		expect(groups).toHaveLength(1);
	});

	it('groups by suggested even after chosen has been changed by the dialog', () => {
		const goblin = entity({ chosen: { to: 'skip' } });
		const groups = groupEntities([goblin]);
		expect(groups[0]?.key).toBe('NonPlayerCharacter');
	});
});

describe('groupImages', () => {
	it('groups battlemaps and illustrations separately', () => {
		const map = image();
		const illustration = image({ key: 'art/npc.png', suggested: { to: 'Prop' }, chosen: { to: 'Prop' } });

		const groups = groupImages([illustration, map]);
		expect(groups.map((group) => group.key)).toEqual(['Map', 'Prop']);
	});
});

describe('setAllEntities', () => {
	it('mutates every item in the group', () => {
		const items = [entity({ key: 'a' }), entity({ key: 'b' })];
		setAllEntities(items, { to: 'skip' });
		expect(items.every((item) => item.chosen.to === 'skip')).toBe(true);
	});
});

describe('setAllImages', () => {
	it('mutates every item in the group', () => {
		const items = [image({ key: 'a' }), image({ key: 'b' })];
		setAllImages(items, { to: 'skip' });
		expect(items.every((item) => item.chosen.to === 'skip')).toBe(true);
	});
});

describe('summariseImport', () => {
	it('counts by chosen, not suggested', () => {
		const plan: AdventurePlan = {
			folder: 'test',
			title: 'Test',
			summary: null,
			chapters: [],
			entities: [
				entity(),
				entity({ key: 'b', chosen: { to: 'skip' } }),
				entity({ key: 'c', chosen: { to: 'EquipmentItem' } }),
			],
			images: [image()],
			coverKey: null,
		};

		expect(summariseImport(plan)).toBe('This will create 1 creature, 1 piece of equipment, 1 map, 1 adventure.');
	});

	it('always mentions the adventure, even with nothing else to create', () => {
		const plan: AdventurePlan = { folder: 'test', title: 'Test', summary: null, chapters: [], entities: [], images: [], coverKey: null };
		expect(summariseImport(plan)).toBe('This will create 1 adventure.');
	});
});
