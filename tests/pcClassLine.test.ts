import { describe, expect, it } from 'vitest';

import { classesFromFrontmatter, readLine } from '../src/pcClassLine';

describe('classesFromFrontmatter', () => {
	it('reads a list of objects, taking `class` or `name` for the name', () => {
		expect(
			classesFromFrontmatter({
				classes: [
					{ class: 'Fighter', subclass: 'Champion', level: 3 },
					{ name: 'Wizard', level: '2' },
				],
			}),
		).toEqual([
			{ Name: 'Fighter', Subclass: 'Champion', Level: 3 },
			{ Name: 'Wizard', Level: 2 },
		]);
	});

	it('reads a list of strings the way Tome prints a class', () => {
		expect(classesFromFrontmatter({ classes: ['Fighter (Champion) 3', 'Wizard 2'] })).toEqual([
			{ Name: 'Fighter', Subclass: 'Champion', Level: 3 },
			{ Name: 'Wizard', Level: 2 },
		]);
	});

	it('reads one string as a whole line', () => {
		expect(classesFromFrontmatter({ classes: 'Rogue (Thief) 2 / Cleric 1' })).toEqual([
			{ Name: 'Rogue', Subclass: 'Thief', Level: 2 },
			{ Name: 'Cleric', Level: 1 },
		]);
	});

	it('gives an entry with no level one level, and leaves a blank entry out', () => {
		expect(classesFromFrontmatter({ classes: ['Wizard', '', { class: '   ' }] })).toEqual([{ Name: 'Wizard', Level: 1 }]);
	});

	it('answers nothing for a note with no property, so the server derives the list from the class line', () => {
		expect(classesFromFrontmatter({ class: 'Barbarian 3', level: 3 })).toBeUndefined();
		expect(classesFromFrontmatter({ classes: [] })).toBeUndefined();
		expect(classesFromFrontmatter({ classes: 7 })).toBeUndefined();
		expect(classesFromFrontmatter({ classes: [{ level: 3 }] })).toBeUndefined();
	});
});

describe('readLine', () => {
	it('separates the subclass whichever way it was written', () => {
		expect(readLine('Rogue — Thief 2')).toEqual({ Name: 'Rogue', Subclass: 'Thief', Level: 2 });
		expect(readLine('Rogue - Thief')).toEqual({ Name: 'Rogue', Subclass: 'Thief', Level: 1 });
		expect(readLine('Rogue [Thief] 4')).toEqual({ Name: 'Rogue', Subclass: 'Thief', Level: 4 });
	});

	it('does not cut a hyphenated name as a subclass', () => {
		expect(readLine('Blood-Hunter 3')).toEqual({ Name: 'Blood-Hunter', Level: 3 });
	});
});
