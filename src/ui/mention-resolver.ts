import { TFile, type App } from 'obsidian';
import { fileToNoteContext } from '../utils';
import type { NoteContext } from '../types';

export interface MentionToken {
	raw: string;
	value: string;
	start: number;
	end: number;
}

export function extractMentions(text: string): MentionToken[] {
	const mentions: MentionToken[] = [];
	const len = text.length;
	let i = 0;

	while (i < len) {
		if (text[i] !== '@') {
			i++;
			continue;
		}

		const start = i;

		if (i + 1 < len && text[i + 1] === '"') {
			let j = i + 2;
			while (j < len && text[j] !== '"' && text[j] !== '\n' && text[j] !== '\r') j++;
			const hasClosingQuote = j < len && text[j] === '"';
			const end = hasClosingQuote ? j + 1 : j;
			const value = text.slice(i + 2, j).trim();
			if (value) {
				mentions.push({ raw: text.slice(start, end), value, start, end });
			}
			i = Math.max(end, i + 1);
			continue;
		}

		let j = i + 1;
		let sawSlash = false;
		while (j < len) {
			const ch = text[j]!;
			if (ch === '@' || ch === '\n' || ch === '\r') break;
			if (/\s/.test(ch)) {
				if (sawSlash) break;
				const nextWhitespace = text.slice(j + 1).search(/\s/);
				const nextWhitespaceIndex = nextWhitespace === -1 ? -1 : j + 1 + nextWhitespace;
				const nextSlashIndex = text.indexOf('/', j + 1);
				if (nextSlashIndex !== -1 && (nextWhitespaceIndex === -1 || nextSlashIndex < nextWhitespaceIndex)) {
					j++;
					continue;
				}
				break;
			}
			if (ch === '/') sawSlash = true;
			j++;
		}

		const value = text.slice(i + 1, j).trim();
		if (value) {
			mentions.push({ raw: text.slice(start, j), value, start, end: j });
		}
		i = Math.max(j, i + 1);
	}

	return mentions;
}

export function resolveMentions(
	app: App,
	prompt: string,
): {
	contexts: NoteContext[];
	resolvedMentions: Set<string>;
	mentionCount: number;
} {
	const mentionTokens = extractMentions(prompt);
	if (mentionTokens.length === 0) {
		return { contexts: [], resolvedMentions: new Set<string>(), mentionCount: 0 };
	}

	const files = app.vault.getMarkdownFiles();
	const basenameMap = new Map<string, TFile>();
	for (const file of files) {
		basenameMap.set(file.basename.toLowerCase(), file);
	}

	const contexts: NoteContext[] = [];
	const resolvedMentions = new Set<string>();
	const seenPaths = new Set<string>();
	const pushFile = (file: TFile) => {
		if (seenPaths.has(file.path)) return;
		seenPaths.add(file.path);
		contexts.push(fileToNoteContext(app, file));
	};

	for (const mentionToken of mentionTokens) {
		const mention = mentionToken.value.trim();
		if (!mention) continue;

		if (mention.startsWith('#')) {
			const tag = mention.slice(1);
			if (!tag) continue;
			let matched = 0;
			for (const file of getFilesByTag(app, tag, files)) {
				pushFile(file);
				matched++;
			}
			if (matched > 0) resolvedMentions.add(mentionToken.raw.toLowerCase());
			continue;
		}

		if (mention.endsWith('/')) {
			const folder = mention.replace(/^\/+/, '').replace(/\/+$/, '');
			if (!folder) continue;
			const folderPrefix = `${folder}/`;
			let matches = files.filter(file => file.path.startsWith(folderPrefix));
			if (matches.length === 0) {
				// Fallback: support mentions that omit higher-level prefixes, e.g.
				// "@Projects/ClientA/" matching "Workspace/Projects/ClientA/...".
				const suffixNeedle = `/${folderPrefix}`.toLowerCase();
				matches = files.filter(file => file.path.toLowerCase().includes(suffixNeedle));
			}
			for (const file of matches) pushFile(file);
			if (matches.length > 0) resolvedMentions.add(mentionToken.raw.toLowerCase());
			continue;
		}

		const byPath = app.vault.getAbstractFileByPath(mention)
			?? app.vault.getAbstractFileByPath(mention.endsWith('.md') ? mention : `${mention}.md`);
		if (byPath instanceof TFile) {
			pushFile(byPath);
			resolvedMentions.add(mentionToken.raw.toLowerCase());
			continue;
		}

		const byBasename = basenameMap.get(mention.toLowerCase());
		if (byBasename) {
			pushFile(byBasename);
			resolvedMentions.add(mentionToken.raw.toLowerCase());
		}
	}

	return { contexts, resolvedMentions, mentionCount: mentionTokens.length };
}

export function getFilesByTag(app: App, tag: string, files = app.vault.getMarkdownFiles()): TFile[] {
	const normalized = tag.startsWith('#') ? tag : `#${tag}`;
	const normalizedLower = normalized.toLowerCase();
	const out: TFile[] = [];
	for (const file of files) {
		const cache = app.metadataCache.getFileCache(file);
		if (!cache) continue;
		if (cache.tags?.some(item => item.tag.toLowerCase() === normalizedLower)) {
			out.push(file);
			continue;
		}
		const frontmatterTags: unknown = cache.frontmatter?.tags;
		if (frontmatterTags !== undefined && frontmatterTags !== null) {
			const values = Array.isArray(frontmatterTags) ? frontmatterTags : [frontmatterTags];
			const tagNameLower = normalizedLower.slice(1);
			if (values.some(value => {
				const text = String(value).trim().toLowerCase();
				return text === tagNameLower || text === normalizedLower;
			})) {
				out.push(file);
			}
		}
	}
	return out;
}

export function collectFolderMentions(files: TFile[]): string[] {
	const folders = new Set<string>();
	for (const file of files) {
		const segments = file.path.split('/');
		if (segments.length <= 1) continue;
		for (let i = 0; i < segments.length - 1; i++) {
			const folder = segments.slice(0, i + 1).join('/');
			folders.add(`${folder}/`);
		}
	}
	return [...folders].sort((a, b) => a.localeCompare(b));
}

export function collectTagMentions(app: App, files: TFile[]): string[] {
	const tags = new Set<string>();
	for (const file of files) {
		const cache = app.metadataCache.getFileCache(file);
		if (!cache) continue;
		for (const tag of cache.tags ?? []) {
			tags.add(tag.tag.startsWith('#') ? tag.tag : `#${tag.tag}`);
		}
		const frontmatterTags: unknown = cache.frontmatter?.tags;
		if (frontmatterTags !== undefined && frontmatterTags !== null) {
			const values = Array.isArray(frontmatterTags) ? frontmatterTags : [frontmatterTags];
			for (const value of values) {
				const text = String(value).trim();
				if (!text) continue;
				tags.add(text.startsWith('#') ? text : `#${text}`);
			}
		}
	}
	return [...tags].sort((a, b) => a.localeCompare(b));
}

export function getActiveMentionContext(textBeforeCursor: string): ActiveMentionContext | null {
	const quotedMatch = textBeforeCursor.match(/@"([^"]*)$/);
	if (quotedMatch) {
		return {
			query: quotedMatch[1] ?? '',
			start: textBeforeCursor.length - quotedMatch[0].length,
			quoted: true,
		};
	}

	const bareMatch = textBeforeCursor.match(/@([^\n\r@]*)$/);
	if (!bareMatch) return null;
	const query = bareMatch[1] ?? '';
	if (query.includes('/')) {
		const lastSlash = query.lastIndexOf('/');
		if (/\s/.test(query.slice(lastSlash + 1))) return null;
	} else if (/\s/.test(query)) {
		return null;
	}

	return {
		query,
		start: textBeforeCursor.length - bareMatch[0].length,
		quoted: false,
	};
}

export interface ActiveMentionContext {
	query: string;
	start: number;
	quoted: boolean;
}

export function buildMentionInsertValue(value: string, quoted: boolean): string {
	const needsQuote = quoted || /\s/.test(value);
	return needsQuote ? `@"${value}" ` : `@${value} `;
}
