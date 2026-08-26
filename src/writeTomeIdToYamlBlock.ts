import { TFile, stringifyYaml } from 'obsidian';
import type { MarkdownPostProcessorContext } from 'obsidian';
import type TomeConnectorPlugin from './main';

export async function writeTomeIdToYamlBlock(
	plugin: TomeConnectorPlugin,
	ctx: MarkdownPostProcessorContext,
	sectionEl: HTMLElement,
	parsed: Record<string, unknown>,
	id: string,
): Promise<void> {
	const sectionInfo = ctx.getSectionInfo(sectionEl);
	if (!sectionInfo) return;

	const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
	if (!(file instanceof TFile)) return;

	const updatedYaml = stringifyYaml({ ...parsed, id }).trimEnd();
	await plugin.app.vault.process(file, (content) => {
		const lines = content.split('\n');
		lines.splice(
			sectionInfo.lineStart + 1,
			sectionInfo.lineEnd - sectionInfo.lineStart - 1,
			updatedYaml,
		);
		return lines.join('\n');
	});
}
