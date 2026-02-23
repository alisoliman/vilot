import { App, MarkdownView, Notice, TFile } from 'obsidian';
import type { CopilotService } from './copilot';
import type { VilotSettings } from './types';
import { DiffModal } from './ui/diff-modal';
import { stripCodeFences } from './utils';

// --- Targeted prompts that return ONLY the new content to add/change ---

const SUMMARIZE_PROMPT =
	'Write a concise summary (3-5 sentences) of the following note. '
	+ 'Return ONLY the summary text, nothing else. Do not include headings or formatting beyond the summary itself. '
	+ 'Do not wrap in code fences.';

const GENERATE_TAGS_PROMPT =
	'Analyze the following note and suggest relevant tags. '
	+ 'Return ONLY the tags as a YAML list, like:\n'
	+ '- tag1\n- tag2\n- tag3\n'
	+ 'Nothing else. No frontmatter delimiters, no explanations.';

const EXTRACT_ACTIONS_PROMPT =
	'Extract all action items, tasks, and todos from the following note. '
	+ 'Return ONLY a Markdown checklist, like:\n'
	+ '- [ ] Task 1\n- [ ] Task 2\n'
	+ 'Nothing else. No headings, no explanations.';

const FRONTMATTER_PROMPT =
	'Analyze the following note and generate appropriate YAML frontmatter. '
	+ 'Include: tags, aliases, description, and any relevant metadata. '
	+ 'Return ONLY the frontmatter content between --- delimiters, like:\n'
	+ '---\ntags:\n  - tag1\ndescription: ...\n---\n'
	+ 'Nothing else.';

function getActiveFileAndContent(app: App): { file: TFile; view: MarkdownView } | null {
	const view = app.workspace.getActiveViewOfType(MarkdownView);
	if (!view?.file) return null;
	return { file: view.file, view };
}

async function askCopilot(
	copilot: CopilotService,
	settings: VilotSettings,
	prompt: string,
): Promise<string> {
	const { promise } = copilot.ask(prompt, null, settings);
	const raw = await promise;
	return stripCodeFences(raw);
}

/** Summarize: prepend a ## Summary section */
export async function summarizeNote(app: App, copilot: CopilotService, settings: VilotSettings): Promise<void> {
	const active = getActiveFileAndContent(app);
	if (!active) { new Notice('No active note open.'); return; }

	const { file } = active;
	const oldContent = await app.vault.read(file);
	const loadingNotice = new Notice('Summarizing note...', 0);

	try {
		const summary = await askCopilot(copilot, settings,
			`${SUMMARIZE_PROMPT}\n\n---\n\n${oldContent}`);
		loadingNotice.hide();

		const newContent = `## Summary\n\n${summary}\n\n${oldContent}`;
		new DiffModal(app, file, oldContent, newContent, 'Summarize note').open();
	} catch (err) {
		loadingNotice.hide();
		new Notice(`Vilot error: ${err instanceof Error ? err.message : String(err)}`);
	}
}

/** Generate tags: update or create frontmatter tags field */
export async function generateTags(app: App, copilot: CopilotService, settings: VilotSettings): Promise<void> {
	const active = getActiveFileAndContent(app);
	if (!active) { new Notice('No active note open.'); return; }

	const { file } = active;
	const oldContent = await app.vault.read(file);
	const loadingNotice = new Notice('Generating tags...', 0);

	try {
		const tagsResult = await askCopilot(copilot, settings,
			`${GENERATE_TAGS_PROMPT}\n\n---\n\n${oldContent}`);
		loadingNotice.hide();

		// Parse tags from the result
		const tags = tagsResult.split('\n')
			.map(l => l.replace(/^-\s*/, '').trim())
			.filter(Boolean);

		if (tags.length === 0) {
			new Notice('No tags suggested.');
			return;
		}

		// Build new content with frontmatter
		let newContent: string;
		const fmMatch = oldContent.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
		if (fmMatch) {
			// Update existing frontmatter
			let fm = fmMatch[1]!;
			const tagsYaml = `tags:\n${tags.map(t => `  - ${t}`).join('\n')}`;
			if (fm.includes('tags:')) {
				fm = fm.replace(/tags:[\s\S]*?(?=\n\w|\n---|$)/, tagsYaml);
			} else {
				fm = `${fm}\n${tagsYaml}`;
			}
			newContent = `---\n${fm}\n---\n${oldContent.slice(fmMatch[0].length)}`;
		} else {
			const tagsYaml = `---\ntags:\n${tags.map(t => `  - ${t}`).join('\n')}\n---\n`;
			newContent = tagsYaml + oldContent;
		}

		new DiffModal(app, file, oldContent, newContent, 'Generate tags').open();
	} catch (err) {
		loadingNotice.hide();
		new Notice(`Vilot error: ${err instanceof Error ? err.message : String(err)}`);
	}
}

/** Extract action items: append a checklist section */
export async function extractActionItems(app: App, copilot: CopilotService, settings: VilotSettings): Promise<void> {
	const active = getActiveFileAndContent(app);
	if (!active) { new Notice('No active note open.'); return; }

	const { file } = active;
	const oldContent = await app.vault.read(file);
	const loadingNotice = new Notice('Extracting action items...', 0);

	try {
		const actions = await askCopilot(copilot, settings,
			`${EXTRACT_ACTIONS_PROMPT}\n\n---\n\n${oldContent}`);
		loadingNotice.hide();

		if (!actions.trim()) {
			new Notice('No action items found.');
			return;
		}

		const newContent = `${oldContent}\n\n## Action Items\n\n${actions}`;
		new DiffModal(app, file, oldContent, newContent, 'Extract action items').open();
	} catch (err) {
		loadingNotice.hide();
		new Notice(`Vilot error: ${err instanceof Error ? err.message : String(err)}`);
	}
}

/** Update frontmatter: generate or replace YAML frontmatter */
export async function updateFrontmatter(app: App, copilot: CopilotService, settings: VilotSettings): Promise<void> {
	const active = getActiveFileAndContent(app);
	if (!active) { new Notice('No active note open.'); return; }

	const { file } = active;
	const oldContent = await app.vault.read(file);
	const loadingNotice = new Notice('Updating frontmatter...', 0);

	try {
		const fmResult = await askCopilot(copilot, settings,
			`${FRONTMATTER_PROMPT}\n\n---\n\n${oldContent}`);
		loadingNotice.hide();

		// Ensure result has frontmatter delimiters
		let newFm = fmResult.trim();
		if (!newFm.startsWith('---')) newFm = `---\n${newFm}`;
		if (!newFm.endsWith('---')) newFm = `${newFm}\n---`;

		// Replace or prepend frontmatter
		let newContent: string;
		const existingFm = oldContent.match(/^---\n[\s\S]*?\n---(?:\n|$)/);
		if (existingFm) {
			newContent = `${newFm}\n${oldContent.slice(existingFm[0].length)}`;
		} else {
			newContent = `${newFm}\n${oldContent}`;
		}

		if (newContent === oldContent) {
			new Notice('No changes suggested.');
			return;
		}

		new DiffModal(app, file, oldContent, newContent, 'Update frontmatter').open();
	} catch (err) {
		loadingNotice.hide();
		new Notice(`Vilot error: ${err instanceof Error ? err.message : String(err)}`);
	}
}

export function insertLastResponseAtCursor(app: App, lastResponse: string): void {
	if (!lastResponse) {
		new Notice('No copilot response to insert.');
		return;
	}

	const view = app.workspace.getActiveViewOfType(MarkdownView);
	if (!view) {
		new Notice('No active editor.');
		return;
	}

	view.editor.replaceSelection(lastResponse);
	new Notice('Inserted response at cursor.');
}
