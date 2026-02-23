import type { App } from 'obsidian';
import type { SkillManager } from '../skills';
import {
	type ActiveMentionContext,
	buildMentionInsertValue,
	collectFolderMentions,
	collectTagMentions,
	getActiveMentionContext,
} from './mention-resolver';

export type AutocompleteMode = 'mention' | 'slash';
export type MentionKind = 'note' | 'folder' | 'tag';

export interface AutocompleteItem {
	type: AutocompleteMode;
	value: string;
	insertValue?: string;
	kind?: MentionKind;
	description?: string;
	icon?: string;
}

export interface AutocompleteState {
	mode: AutocompleteMode | null;
	items: AutocompleteItem[];
	index: number;
}

/** Build autocomplete items for the current input text and cursor position. */
export function buildAutocompleteItems(
	app: App,
	textBeforeCursor: string,
	skillManager: SkillManager,
	disabledSkills: string[],
): { state: AutocompleteState; mentionContext: ActiveMentionContext | null } {
	const mentionContext = getActiveMentionContext(textBeforeCursor);
	if (mentionContext) {
		const query = mentionContext.query.toLowerCase();
		const files = app.vault.getMarkdownFiles();
		let matches: AutocompleteItem[] = [];

		if (query.startsWith('#')) {
			const tags = collectTagMentions(app, files)
				.filter(tag => tag.toLowerCase().includes(query))
				.slice(0, 8);
			matches = tags.map(tag => ({
				type: 'mention' as const,
				kind: 'tag' as const,
				value: tag,
				insertValue: buildMentionInsertValue(tag, mentionContext.quoted),
				description: 'Tag',
				icon: '🏷️',
			}));
		} else {
			const folderMatches = collectFolderMentions(files)
				.filter(folder => folder.toLowerCase().includes(query))
				.slice(0, 4)
				.map(folder => ({
					type: 'mention' as const,
					kind: 'folder' as const,
					value: folder,
					insertValue: buildMentionInsertValue(folder, mentionContext.quoted),
					description: 'Folder',
					icon: '📁',
				}));

			const noteMatches = files
				.filter(file =>
					file.basename.toLowerCase().includes(query)
					|| file.path.toLowerCase().includes(query),
				)
				.sort((a, b) => a.basename.localeCompare(b.basename))
				.slice(0, 6)
				.map(file => ({
					type: 'mention' as const,
					kind: 'note' as const,
					value: file.basename,
					insertValue: buildMentionInsertValue(file.basename, mentionContext.quoted),
					description: file.path,
					icon: '📄',
				}));

			matches = [...folderMatches, ...noteMatches].slice(0, 8);
		}

		if (matches.length === 0) {
			return { state: { mode: null, items: [], index: -1 }, mentionContext: null };
		}
		return { state: { mode: 'mention', items: matches, index: 0 }, mentionContext };
	}

	const slashMatch = textBeforeCursor.match(/(?:^|\s)(\/[^\s/]*)$/);
	if (slashMatch) {
		const query = slashMatch[1]!.slice(1).toLowerCase();
		const slashSkills = skillManager.getSlashCommandSkills(disabledSkills);
		const matches = slashSkills
			.filter(skill => {
				const command = (skill.slashCommand ?? '').toLowerCase();
				return command.includes(query) || skill.name.toLowerCase().includes(query);
			})
			.slice(0, 8)
			.map(skill => ({
				type: 'slash' as const,
				value: skill.slashCommand!,
				description: skill.description,
			}));
		if (matches.length === 0) {
			return { state: { mode: null, items: [], index: -1 }, mentionContext: null };
		}
		return { state: { mode: 'slash', items: matches, index: 0 }, mentionContext: null };
	}

	return { state: { mode: null, items: [], index: -1 }, mentionContext: null };
}
