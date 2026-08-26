import { describe, expect, it } from 'vitest';

import { parseAdventure, sceneHeadingLines, stripSceneIdMarker, withSceneIdMarker } from '../src/adventure/adventureParser';
import type { PlannedBlock, PlannedEntityBlock, PlannedTextBlock } from '../src/adventure/adventurePlan';

/** The prose blocks, for assertions about text rather than about nodes. */
function textBlocks(blocks: PlannedBlock[] = []): PlannedTextBlock[] {
	return blocks.filter((block): block is PlannedTextBlock => block.kind !== 'Entity');
}

/** The library nodes - maps, props, creatures - standing in the scene's flow. */
function entityBlocks(blocks: PlannedBlock[] = []): PlannedEntityBlock[] {
	return blocks.filter((block): block is PlannedEntityBlock => block.kind === 'Entity');
}

function proseOf(blocks: PlannedBlock[] = []): string {
	return textBlocks(blocks)
		.map((block) => block.text)
		.join('\n');
}

describe('parseAdventure', () => {
	it('turns a chapter with no headings into one scene named after the chapter', () => {
		const plan = parseAdventure({
			folder: 'lost-mine-of-phandelver',
			title: 'Lost Mine of Phandelver',
			summary: null,
			chapters: [{ title: 'Foreword', content: 'Just some prose, no headings at all.' }],
		});

		expect(plan.chapters).toHaveLength(1);
		expect(plan.chapters[0]?.scenes).toEqual([
			{
				title: 'Foreword',
				blocks: [
				{
					kind: 'Markdown',
					audience: 'Gm',
					text: 'Just some prose, no headings at all.',
					refs: [],
					imageRefs: [],
				},
			],
			id: null,
			},
		]);
	});

	it('turns each ## section into its own scene', () => {
		const content = '## Goblin Ambush\n\nThe road narrows here.\n\n## Cragmaw Hideout\n\nA cave mouth looms.';
		const plan = parseAdventure({
			folder: 'test',
			title: 'Test',
			summary: null,
			chapters: [{ title: 'Chapter 1', content }],
		});

		expect(plan.chapters[0]?.scenes.map((scene) => scene.title)).toEqual([
			'Goblin Ambush',
			'Cragmaw Hideout',
		]);
	});

	it('keeps a chapter preamble as its own lead scene alongside its sections', () => {
		const content = 'Lead-in prose before any heading.\n\n## First Section\n\nSection prose.';
		const plan = parseAdventure({
			folder: 'test',
			title: 'Test',
			summary: null,
			chapters: [{ title: 'Chapter 1', content }],
		});

		expect(plan.chapters[0]?.scenes.map((scene) => scene.title)).toEqual(['Chapter 1', 'First Section']);
	});

	it('promotes a numbered room buried several headings deep to a sibling scene', () => {
		const content = [
			'## Cragmaw Hideout',
			'',
			'The area overview.',
			'',
			'### The Approach',
			'',
			'Approach prose.',
			'',
			'#### B1: Guard Post',
			'',
			'Two goblins keep watch here.',
		].join('\n');

		const plan = parseAdventure({
			folder: 'test',
			title: 'Test',
			summary: null,
			chapters: [{ title: 'Chapter 1', content }],
		});

		const titles = plan.chapters[0]?.scenes.map((scene) => scene.title);
		expect(titles).toEqual(['Cragmaw Hideout', 'B1: Guard Post']);

		const parentText = proseOf(plan.chapters[0]?.scenes[0]?.blocks);
		expect(parentText).toContain('The area overview.');
		expect(parentText).toContain('Approach prose.');
		expect(parentText).not.toContain('Two goblins keep watch here.');

		expect(proseOf(plan.chapters[0]?.scenes[1]?.blocks)).toContain('Two goblins keep watch here.');
	});

	it('leaves a numbered heading exactly where it was written when the chapter opts out of promotion', () => {
		const content = [
			'## Cragmaw Hideout',
			'',
			'The area overview.',
			'',
			'#### B1: Guard Post',
			'',
			'Two goblins keep watch here.',
		].join('\n');

		const plan = parseAdventure({
			folder: 'test',
			title: 'Test',
			summary: null,
			chapters: [{ title: 'Chapter 1', content, promoteRooms: false }],
		});

		const titles = plan.chapters[0]?.scenes.map((scene) => scene.title);
		expect(titles).toEqual(['Cragmaw Hideout']);
		expect(proseOf(plan.chapters[0]?.scenes[0]?.blocks)).toContain('Two goblins keep watch here.');
	});

	it('still emits the parent scene when every last line of its body was promoted away', () => {
		const content = '## Cragmaw Hideout\n\n### B1: Guard Post\n\nGoblins here.';
		const plan = parseAdventure({
			folder: 'test',
			title: 'Test',
			summary: null,
			chapters: [{ title: 'Chapter 1', content }],
		});

		expect(plan.chapters[0]?.scenes.map((scene) => scene.title)).toEqual(['Cragmaw Hideout', 'B1: Guard Post']);
		expect(plan.chapters[0]?.scenes[0]?.blocks).toEqual([]);
	});

	it('collects a bestiary mention into the entity list and dedupes repeats across scenes', () => {
		const content =
			'## Scene One\n\nA [Goblin](3-Mechanics/CLI/bestiary/goblin-xphb.md) attacks.\n\n' +
			'## Scene Two\n\nAnother [Goblin](3-Mechanics/CLI/bestiary/goblin-xphb.md) waits.';
		const plan = parseAdventure({
			folder: 'test',
			title: 'Test',
			summary: null,
			chapters: [{ title: 'Chapter 1', content }],
		});

		expect(plan.entities).toEqual([
			{
				key: '3-Mechanics/CLI/bestiary/goblin-xphb.md',
				label: 'Goblin',
				tomeName: 'Goblin',
				occurrences: 2,
				suggested: { to: 'NonPlayerCharacter' },
				chosen: { to: 'NonPlayerCharacter' },
				resolvedId: null,
			},
		]);
	});

	it('suggests MagicItem for an items link, provisionally', () => {
		const content = '## Scene One\n\nThe [Bag of Holding](3-Mechanics/CLI/items/bag-of-holding-xdmg.md) sits here.';
		const plan = parseAdventure({
			folder: 'test',
			title: 'Test',
			summary: null,
			chapters: [{ title: 'Chapter 1', content }],
		});

		expect(plan.entities[0]?.suggested).toEqual({ to: 'MagicItem' });
	});

	it('suggests skip, provisionally, for a hand-authored wikilink - vault resolution settles it', () => {
		const content = '## Scene One\n\nThe party is ambushed by [[Goblin Boss]].';
		const plan = parseAdventure({
			folder: 'test',
			title: 'Test',
			summary: null,
			chapters: [{ title: 'Chapter 1', content }],
		});

		expect(plan.entities).toEqual([
			{
				key: 'Goblin Boss',
				label: 'Goblin Boss',
				tomeName: 'Goblin Boss',
				occurrences: 1,
				suggested: { to: 'skip' },
				chosen: { to: 'skip' },
				resolvedId: null,
			},
		]);
	});

	it('forces NonPlayerCharacter for a wikilink inside an [!npc] callout, skipping resolution entirely', () => {
		const content = '## Scene One\n\n> [!npc]\n> [[Goblin Boss]]';
		const plan = parseAdventure({
			folder: 'test',
			title: 'Test',
			summary: null,
			chapters: [{ title: 'Chapter 1', content }],
		});

		expect(plan.entities).toEqual([
			{
				key: 'Goblin Boss',
				label: 'Goblin Boss',
				tomeName: 'Goblin Boss',
				occurrences: 1,
				suggested: { to: 'NonPlayerCharacter' },
				chosen: { to: 'NonPlayerCharacter' },
				resolvedId: null,
			},
		]);
	});

	it('forces Map for an image inside an [!map] callout, overriding the looksLikeMap guess', () => {
		const content = '## Scene One\n\n> [!map]\n> ![Portrait of the boss](art/npc.png)';
		const plan = parseAdventure({
			folder: 'test',
			title: 'Test',
			summary: null,
			chapters: [{ title: 'Chapter 1', content }],
		});

		expect(plan.images).toEqual([
			expect.objectContaining({ key: 'art/npc.png', suggested: { to: 'Map' }, chosen: { to: 'Map' } }),
		]);
	});

	it('places an Entity node for a wikilink mention, same as a CLI one', () => {
		const content = '## Scene One\n\nThe party is ambushed by [[Goblin Boss]].';
		const plan = parseAdventure({
			folder: 'test',
			title: 'Test',
			summary: null,
			chapters: [{ title: 'Chapter 1', content }],
		});

		const blocks = plan.chapters[0]?.scenes[0]?.blocks ?? [];
		expect(blocks.some((block) => block.kind === 'Entity' && block.key === 'Goblin Boss')).toBe(true);
	});

	it('records a ref for a block that mentions an entity, offset into the flattened text', () => {
		const content = '## Scene One\n\nA [Goblin](3-Mechanics/CLI/bestiary/goblin-xphb.md) attacks.';
		const plan = parseAdventure({
			folder: 'test',
			title: 'Test',
			summary: null,
			chapters: [{ title: 'Chapter 1', content }],
		});

		const block = textBlocks(plan.chapters[0]?.scenes[0]?.blocks)[0];
		expect(block?.text).toBe('A Goblin attacks.');
		expect(block?.refs).toEqual([
			{ entity: '3-Mechanics/CLI/bestiary/goblin-xphb.md', text: 'Goblin', start: 2, end: 8 },
		]);
	});

	it('puts a creature node in the flow after the paragraph that first names it', () => {
		const content = '## Scene One\n\nA [Goblin](3-Mechanics/CLI/bestiary/goblin-xphb.md) attacks.';
		const plan = parseAdventure({
			folder: 'test',
			title: 'Test',
			summary: null,
			chapters: [{ title: 'Chapter 1', content }],
		});

		const blocks = plan.chapters[0]?.scenes[0]?.blocks ?? [];
		expect(blocks.map((block) => block.kind)).toEqual(['Markdown', 'Entity']);
		expect(blocks[1]).toEqual({
			kind: 'Entity',
			key: '3-Mechanics/CLI/bestiary/goblin-xphb.md',
			from: 'entity',
			note: null,
			audience: 'Gm',
		});
	});

	it('gives a creature one node per scene however often it is named', () => {
		const content =
			'## Scene One\n\nA [Goblin](3-Mechanics/CLI/bestiary/goblin-xphb.md) attacks.\n\n' +
			'Another [Goblin](3-Mechanics/CLI/bestiary/goblin-xphb.md) follows.';
		const plan = parseAdventure({
			folder: 'test',
			title: 'Test',
			summary: null,
			chapters: [{ title: 'Chapter 1', content }],
		});

		expect(entityBlocks(plan.chapters[0]?.scenes[0]?.blocks)).toHaveLength(1);
	});

	it('puts a standalone picture in the flow as its own node, not as prose', () => {
		const content = '## Scene One\n\nBefore.\n\n![A portrait](art/npc.png#center)\n\nAfter.';
		const plan = parseAdventure({
			folder: 'test',
			title: 'Test',
			summary: null,
			chapters: [{ title: 'Chapter 1', content }],
		});

		const blocks = plan.chapters[0]?.scenes[0]?.blocks ?? [];
		expect(blocks.map((block) => block.kind)).toEqual(['Markdown', 'Entity', 'Markdown']);
		expect(blocks[1]).toEqual({
			kind: 'Entity',
			key: 'art/npc.png',
			from: 'image',
			note: 'A portrait',
			audience: 'Gm',
		});
		expect(proseOf(blocks)).not.toContain('A portrait');
	});

	it('makes a gallery picture a map node and a loose picture a prop node', () => {
		const content =
			'## Scene One\n\n> [!gallery]\n> ![](maps/room-1.webp)\n\n## Scene Two\n\n![Art](art/npc.png)';
		const plan = parseAdventure({
			folder: 'test',
			title: 'Test',
			summary: null,
			chapters: [{ title: 'Chapter 1', content }],
		});

		expect(plan.images.find((image) => image.key === 'maps/room-1.webp')?.suggested).toEqual({ to: 'Map' });
		expect(plan.images.find((image) => image.key === 'art/npc.png')?.suggested).toEqual({ to: 'Prop' });
	});

	it('collects a gallery pair as one deduped image, DM and player', () => {
		const content =
			'## Scene One\n\n> [!gallery]\n> ![](maps/room-1.webp)\n> ![Player Version](maps/room-1-player.webp)';
		const plan = parseAdventure({
			folder: 'test',
			title: 'Test',
			summary: null,
			chapters: [{ title: 'Chapter 1', content }],
		});

		expect(plan.images).toEqual([
			{
				key: 'maps/room-1.webp',
				// The filename minus its extension, not the path: it is what the review dialog shows.
				label: 'room-1',
				dmPath: 'maps/room-1.webp',
				playerPath: 'maps/room-1-player.webp',
				suggested: { to: 'Map' },
				chosen: { to: 'Map' },
				resolvedId: null,
			},
		]);
	});

	it('strips only the trailing extension from a fallback label, keeping dots elsewhere', () => {
		const content = '## Scene One\n\n![](maps/room.1.webp)';
		const plan = parseAdventure({
			folder: 'test',
			title: 'Test',
			summary: null,
			chapters: [{ title: 'Chapter 1', content }],
		});

		expect(plan.images.find((image) => image.key === 'maps/room.1.webp')?.label).toBe('room.1');
	});

	it('suggests Prop for a standalone illustration', () => {
		const content = '## Scene One\n\nSome prose.\n\n![A portrait](art/npc.png#center)\n\nMore prose.';
		const plan = parseAdventure({
			folder: 'test',
			title: 'Test',
			summary: null,
			chapters: [{ title: 'Chapter 1', content }],
		});

		expect(plan.images).toEqual([
			{
				key: 'art/npc.png',
				label: 'A portrait',
				dmPath: 'art/npc.png',
				playerPath: null,
				suggested: { to: 'Prop' },
				chosen: { to: 'Prop' },
				resolvedId: null,
			},
		]);
	});

	it('flattens an image embed to its alt text instead of leaving raw embed markup in the prose', () => {
		const content = '## Scene One\n\nBefore.\n\n![A portrait of Strahd](art/strahd.png#center)\n\nAfter.';
		const plan = parseAdventure({
			folder: 'test',
			title: 'Test',
			summary: null,
			chapters: [{ title: 'Chapter 1', content }],
		});

		const text = proseOf(plan.chapters[0]?.scenes[0]?.blocks);
		expect(text).not.toContain('![');
		expect(text).not.toContain('art/strahd.png');
	});

	/**
	 * The 19-in-4,638 case the corpus turned up: a picture inside a table row
	 * cannot be lifted out into its own node without taking the row apart, so
	 * it stays inline as its alt text and carries a ref instead.
	 */
	it('leaves a picture inside a table row inline, as alt text with a ref', () => {
		const content = '## Scene One\n\n| Place | Art |\n| --- | --- |\n| Waterdeep | ![City](art/city.webp#center) |';
		const plan = parseAdventure({
			folder: 'test',
			title: 'Test',
			summary: null,
			chapters: [{ title: 'Chapter 1', content }],
		});

		const blocks = plan.chapters[0]?.scenes[0]?.blocks ?? [];
		expect(entityBlocks(blocks)).toHaveLength(0);

		const block = textBlocks(blocks)[0];
		expect(block?.text).toContain('| Waterdeep | City |');

		const ref = block?.imageRefs[0];
		expect(ref?.image).toBe('art/city.webp');
		expect(block?.text.slice(ref?.start, ref?.end)).toBe('City');
	});

	it('carries the folder, title and summary through unchanged', () => {
		const plan = parseAdventure({
			folder: 'lost-mine-of-phandelver',
			title: 'Lost Mine of Phandelver',
			summary: 'A starter adventure.',
			chapters: [],
		});

		expect(plan.folder).toBe('lost-mine-of-phandelver');
		expect(plan.title).toBe('Lost Mine of Phandelver');
		expect(plan.summary).toBe('A starter adventure.');
		expect(plan.chapters).toEqual([]);
	});

	it('carries the chapter id through from ChapterSource unchanged', () => {
		const plan = parseAdventure({
			folder: 'test',
			title: 'Test',
			summary: null,
			chapters: [{ title: 'Chapter 1', content: 'Some prose.', id: 'chapter-id-1' }],
		});

		expect(plan.chapters[0]?.id).toBe('chapter-id-1');
	});

	it('is null for a chapter id nobody supplied', () => {
		const plan = parseAdventure({
			folder: 'test',
			title: 'Test',
			summary: null,
			chapters: [{ title: 'Chapter 1', content: 'Some prose.' }],
		});

		expect(plan.chapters[0]?.id).toBeNull();
	});

	it('reads a scene id off its heading marker and strips it from the title', () => {
		const content = '## The Village Square %%tome_scene_id: 3fa85f64-1234-4a5b-8c9d-abcdef012345%%\n\nProse.';
		const plan = parseAdventure({
			folder: 'test',
			title: 'Test',
			summary: null,
			chapters: [{ title: 'Chapter 1', content }],
		});

		const scene = plan.chapters[0]?.scenes[0];
		expect(scene?.title).toBe('The Village Square');
		expect(scene?.id).toBe('3fa85f64-1234-4a5b-8c9d-abcdef012345');
	});

	it('leaves a scene with no marker at all id-less', () => {
		const content = '## The Village Square\n\nProse.';
		const plan = parseAdventure({
			folder: 'test',
			title: 'Test',
			summary: null,
			chapters: [{ title: 'Chapter 1', content }],
		});

		expect(plan.chapters[0]?.scenes[0]?.id).toBeNull();
	});

	it('reads an id marker off a promoted room heading too', () => {
		const content = [
			'## Cragmaw Hideout',
			'',
			'The area overview.',
			'',
			'#### B1: Guard Post %%tome_scene_id: room-id-1%%',
			'',
			'Two goblins keep watch here.',
		].join('\n');
		const plan = parseAdventure({
			folder: 'test',
			title: 'Test',
			summary: null,
			chapters: [{ title: 'Chapter 1', content }],
		});

		const room = plan.chapters[0]?.scenes[1];
		expect(room?.title).toBe('B1: Guard Post');
		expect(room?.id).toBe('room-id-1');
	});

	it('a chapter with no ## headings has an id-less preamble scene, marker or not', () => {
		const plan = parseAdventure({
			folder: 'test',
			title: 'Test',
			summary: null,
			chapters: [{ title: 'Foreword', content: 'Just prose, no headings.' }],
		});

		expect(plan.chapters[0]?.scenes[0]?.id).toBeNull();
	});
});

describe('stripSceneIdMarker', () => {
	it('strips the marker and returns the id', () => {
		expect(stripSceneIdMarker('The Village Square %%tome_scene_id: abc-123%%')).toEqual({
			title: 'The Village Square',
			id: 'abc-123',
		});
	});

	it('returns the heading untouched, with a null id, when there is no marker', () => {
		expect(stripSceneIdMarker('The Village Square')).toEqual({ title: 'The Village Square', id: null });
	});

	it('trims whitespace around both the title and the id', () => {
		expect(stripSceneIdMarker('The Village Square   %%tome_scene_id:   abc-123   %%')).toEqual({
			title: 'The Village Square',
			id: 'abc-123',
		});
	});
});

describe('sceneHeadingLines', () => {
	it('is null for the preamble scene, then the line number of each ## heading', () => {
		const content = 'Some lead prose.\n\n## The Village Square\n\nProse.\n\n## The Bell Tower\n\nMore prose.';
		expect(sceneHeadingLines(content, true)).toEqual([null, 2, 6]);
	});

	it('has no null entry when there is no preamble to skip', () => {
		const content = '## The Village Square\n\nProse.';
		expect(sceneHeadingLines(content, true)).toEqual([0]);
	});

	it('matches parseAdventure\'s own scene order for a promoted room, line for line', () => {
		const content = [
			'## Cragmaw Hideout', // 0
			'', // 1
			'The area overview.', // 2
			'', // 3
			'#### B1: Guard Post', // 4
			'', // 5
			'Two goblins keep watch here.', // 6
		].join('\n');

		expect(sceneHeadingLines(content, true)).toEqual([0, 4]);

		const plan = parseAdventure({
			folder: 'test',
			title: 'Test',
			summary: null,
			chapters: [{ title: 'Chapter 1', content }],
		});
		expect(plan.chapters[0]?.scenes.map((scene) => scene.title)).toEqual(['Cragmaw Hideout', 'B1: Guard Post']);
	});

	it('skips a room heading entirely when promoteRooms is false, matching parseChapter', () => {
		const content = '## Cragmaw Hideout\n\n#### B1: Guard Post\n\nGoblins here.';
		expect(sceneHeadingLines(content, false)).toEqual([0]);
	});

	it('ignores a marker already on the heading when finding its line', () => {
		const content = '## The Village Square %%tome_scene_id: old-id%%\n\nProse.';
		expect(sceneHeadingLines(content, true)).toEqual([0]);
	});
});

describe('withSceneIdMarker', () => {
	it('appends a marker to a bare heading', () => {
		expect(withSceneIdMarker('## The Village Square', 'abc-123')).toBe(
			'## The Village Square %%tome_scene_id: abc-123%%',
		);
	});

	it('replaces an existing marker rather than appending a second one', () => {
		expect(withSceneIdMarker('## The Village Square %%tome_scene_id: old-id%%', 'new-id')).toBe(
			'## The Village Square %%tome_scene_id: new-id%%',
		);
	});

	it('works on a deeper, room-shaped heading', () => {
		expect(withSceneIdMarker('#### B1: Guard Post', 'room-id-1')).toBe(
			'#### B1: Guard Post %%tome_scene_id: room-id-1%%',
		);
	});

	it('returns a line with no heading at all untouched', () => {
		expect(withSceneIdMarker('Just some prose.', 'abc-123')).toBe('Just some prose.');
	});
});
