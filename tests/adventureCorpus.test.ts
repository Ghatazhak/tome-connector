import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseAdventureIndex } from '../src/adventure/adventureIndex';
import { parseAdventure } from '../src/adventure/adventureParser';
import type { ChapterSource } from '../src/adventure/adventureParser';
import type { AdventurePlan } from '../src/adventure/adventurePlan';

/**
 * The adventure parser, run over real `ttrpg-convert-cli` output.
 *
 * Skipped when the corpus is absent, for the same reason `cliCorpus.test.ts`
 * is: it is generated from books the user owns and cannot be committed, so
 * CI and any other machine skip it. Every other test in this folder feeds
 * the parser a fixture chosen to exercise one decision; this one asks
 * whether it survives a whole shelf of real adventures without throwing,
 * without an empty scene title, and without a block or a request the server
 * would refuse outright.
 */
const CORPUS = 'C:/TTRPGCLI/bin/dm/3-Mechanics/CLI/adventures';
const present = existsSync(CORPUS);

/** Mirrors `AdventureImportService`'s caps, so drift between the two shows up here first. */
const MAX_CHAPTERS_PER_IMPORT = 100;
const MAX_SCENES_PER_IMPORT = 3_000;
const MAX_BLOCK_TEXT_LENGTH = 8_000;
/** `StorybookController.MaxImportPayloadBytes`. */
const MAX_IMPORT_PAYLOAD_BYTES = 16 * 1024 * 1024;

function adventureFolders(): string[] {
	return readdirSync(CORPUS).filter((name) => statSync(join(CORPUS, name)).isDirectory());
}

/** Reads and parses one adventure folder straight off disk, no vault involved. */
function readAdventure(folderName: string): AdventurePlan | null {
	const folderPath = join(CORPUS, folderName);
	const notes = readdirSync(folderPath).filter((name) => name.toLowerCase().endsWith('.md'));

	let title: string | null = null;
	let entries: { title: string; file: string }[] = [];
	for (const note of notes) {
		const parsed = parseAdventureIndex(readFileSync(join(folderPath, note), 'utf8'));
		if (parsed) {
			title = parsed.title;
			entries = parsed.entries;
			break;
		}
	}
	if (title === null) return null;

	const chapters: ChapterSource[] = [];
	for (const entry of entries) {
		const filePath = join(folderPath, entry.file);
		if (!existsSync(filePath)) continue;
		chapters.push({ title: entry.title, content: readFileSync(filePath, 'utf8') });
	}

	return parseAdventure({ folder: folderName, title, summary: null, chapters });
}

/** The shape `AdventureImportService` actually receives, for the payload-size check. */
function serialisedRequestSize(plan: AdventurePlan): number {
	const request = {
		title: plan.title,
		summary: plan.summary,
		chapters: plan.chapters.map((chapter) => ({
			title: chapter.title,
			scenes: chapter.scenes.map((scene) => ({
				title: scene.title,
				blocks: scene.blocks.map((block) => ({
					kind: block.kind,
					text: block.kind === 'Entity' ? null : block.text,
					audience: block.audience,
				})),
			})),
		})),
	};
	return new TextEncoder().encode(JSON.stringify(request)).length;
}

function assertWellFormed(plan: AdventurePlan): void {
	expect(plan.chapters.length).toBeGreaterThan(0);
	expect(plan.chapters.length).toBeLessThanOrEqual(MAX_CHAPTERS_PER_IMPORT);

	let sceneCount = 0;
	for (const chapter of plan.chapters) {
		for (const scene of chapter.scenes) {
			sceneCount += 1;
			expect(scene.title.trim()).not.toBe('');
			for (const block of scene.blocks) {
				if (block.kind === 'Entity') {
					// The server refuses an Entity block that names no row.
					expect(block.key).not.toBe('');
					continue;
				}
				expect(block.text.length).toBeLessThanOrEqual(MAX_BLOCK_TEXT_LENGTH);
			}
		}
	}
	expect(sceneCount).toBeLessThanOrEqual(MAX_SCENES_PER_IMPORT);
	expect(serialisedRequestSize(plan)).toBeLessThanOrEqual(MAX_IMPORT_PAYLOAD_BYTES);
}

describe.skipIf(!present)('ttrpg-convert-cli adventure corpus', () => {
	const folders = present ? adventureFolders() : [];

	it('found at least one adventure folder to parse', () => {
		expect(folders.length).toBeGreaterThan(0);
	});

	for (const folder of folders) {
		it(`"${folder}" parses into a well-formed plan under the server's caps`, () => {
			const plan = readAdventure(folder);
			expect(plan, `"${folder}" has no note that parses as an index`).not.toBeNull();
			if (plan) assertWellFormed(plan);
		});
	}
});
