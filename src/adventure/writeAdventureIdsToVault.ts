import { App, TFile } from 'obsidian';

import { sceneHeadingLines, withSceneIdMarker } from './adventureParser';
import type { AdventurePlan, PlannedChapter } from './adventurePlan';
import type { ImportedChapterResultBody, ImportedSceneResultBody } from './sendAdventureToTome';

/**
 * Writes the ids a successful import returned back into the vault - a
 * `tome_chapter_id` in each chapter note's frontmatter, and a
 * `%%tome_scene_id: ...%%` suffix on each scene's own heading line - so a
 * re-import can find the same rows again by id instead of by title, which is
 * what makes renaming a chapter or a scene heading in Obsidian a rename in
 * Tome rather than a new row beside the old one.
 *
 * **Best-effort, chapter by chapter.** A chapter with no `notePath` (a
 * fixture, or a note deleted between building the plan and this write) is
 * skipped rather than thrown on, and one chapter's failure does not stop the
 * rest - an id that never made it into a note simply falls back to matching
 * by title on the next import, exactly as it always did before this existed.
 */
export async function writeAdventureIdsToVault(
	app: App,
	plan: AdventurePlan,
	chapterResults: ImportedChapterResultBody[],
): Promise<void> {
	for (const [index, chapter] of plan.chapters.entries()) {
		const result = chapterResults[index];
		if (!result || !chapter.notePath) continue;

		const file = app.vault.getAbstractFileByPath(chapter.notePath);
		if (!(file instanceof TFile)) continue;

		try {
			await writeChapterId(app, file, result.id);
			await writeSceneIds(app, file, chapter, result.scenes);
		} catch (error) {
			console.warn(`Tome Connector: could not write ids back into "${chapter.notePath}".`, error);
		}
	}
}

async function writeChapterId(app: App, file: TFile, id: string): Promise<void> {
	await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
		frontmatter['tome_chapter_id'] = id;
	});
}

/**
 * Rewrites only the heading lines `sceneHeadingLines` names, splicing into the
 * note's exact original text rather than splitting and rejoining on `\n` -
 * that would silently normalise every other line's ending too, turning one
 * marker write into a whole-file diff for a Windows-authored note.
 */
async function writeSceneIds(
	app: App,
	file: TFile,
	chapter: PlannedChapter,
	sceneResults: ImportedSceneResultBody[],
): Promise<void> {
	await app.vault.process(file, (content) => {
		const headingLines = sceneHeadingLines(content, chapter.promoteRooms);
		// Odd indices are the line terminators themselves, kept so nothing but the
		// targeted lines' own text changes.
		const parts = content.split(/(\r?\n)/);

		for (const [sceneIndex, lineIndex] of headingLines.entries()) {
			if (lineIndex === null) continue;
			const sceneResult = sceneResults[sceneIndex];
			const partIndex = lineIndex * 2;
			const line = parts[partIndex];
			if (!sceneResult || line === undefined) continue;
			parts[partIndex] = withSceneIdMarker(line, sceneResult.id);
		}

		return parts.join('');
	});
}
