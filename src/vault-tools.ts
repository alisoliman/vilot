import { Modal, Notice, TFile, type App, type CachedMetadata } from 'obsidian';
import { defineTool, type Tool } from '@github/copilot-sdk';
import { buildEditProposalFromSearchReplace } from './composer';
import { computeLineDiff } from './utils/diff';

interface SearchVaultArgs {
	query: string;
	limit?: number;
}

interface ReadNoteArgs {
	path: string;
}

interface ListNotesArgs {
	folder?: string;
	tag?: string;
}

interface GetNoteMetadataArgs {
	path: string;
}

interface GetBacklinksArgs {
	path: string;
}

interface ProposeEditArgs {
	path: string;
	description: string;
	search: string;
	replace: string;
}

/** Show a confirmation modal with a diff preview for destructive writes. Returns true if approved. */
function confirmWrite(app: App, file: TFile, oldContent: string, newContent: string, description: string): Promise<boolean> {
	return new Promise<boolean>((resolve) => {
		const modal = new (class extends Modal {
			onOpen() {
				const { contentEl } = this;
				contentEl.addClass('vilot-diff-modal');
				const header = contentEl.createDiv({ cls: 'vilot-diff-header' });
				header.createEl('h3', { text: `Confirm: ${description}`, cls: 'vilot-diff-title' });
				header.createEl('code', { text: file.path, cls: 'vilot-diff-file-path' });

				const diffContainer = contentEl.createDiv({ cls: 'vilot-diff-container' });
				diffContainer.setAttribute('tabindex', '0');
				const diffLines = computeLineDiff(oldContent, newContent);
				const added = diffLines.filter(l => l.type === 'added').length;
				const removed = diffLines.filter(l => l.type === 'removed').length;
				if (added || removed) {
					const stats = header.createDiv({ cls: 'vilot-diff-stats' });
					if (added) stats.createEl('span', { text: `+${added}`, cls: 'vilot-diff-stat-added' });
					if (removed) stats.createEl('span', { text: `−${removed}`, cls: 'vilot-diff-stat-removed' });
				}
				let oldLineNum = 0;
				let newLineNum = 0;
				for (const line of diffLines) {
					const lineEl = diffContainer.createDiv({ cls: `vilot-diff-line vilot-diff-${line.type}` });
					const gutterEl = lineEl.createEl('span', { cls: 'vilot-diff-gutter' });
					const markerEl = lineEl.createEl('span', { cls: 'vilot-diff-marker' });
					const contentSpan = lineEl.createEl('span', { cls: 'vilot-diff-text' });
					contentSpan.textContent = line.text || ' ';
					if (line.type === 'removed') { oldLineNum++; gutterEl.textContent = String(oldLineNum); markerEl.textContent = '−'; }
					else if (line.type === 'added') { newLineNum++; gutterEl.textContent = String(newLineNum); markerEl.textContent = '+'; }
					else { oldLineNum++; newLineNum++; gutterEl.textContent = String(newLineNum); markerEl.textContent = ' '; }
				}

				const btnRow = contentEl.createDiv({ cls: 'vilot-diff-btn-row' });
				btnRow.createEl('button', { text: 'Reject', cls: 'vilot-diff-reject-btn' })
					.addEventListener('click', () => { resolve(false); this.close(); });
				btnRow.createEl('button', { text: 'Accept changes', cls: 'vilot-diff-accept-btn mod-cta' })
					.addEventListener('click', () => { resolve(true); this.close(); });
			}
			onClose() { resolve(false); }
		})(app);
		modal.open();
	});
}

function resolveFile(app: App, path: string): TFile | null {
	const file = app.vault.getAbstractFileByPath(path);
	if (file instanceof TFile && file.extension === 'md') return file;
	// Try with .md extension
	const withMd = app.vault.getAbstractFileByPath(path.endsWith('.md') ? path : `${path}.md`);
	if (withMd instanceof TFile && withMd.extension === 'md') return withMd;
	return null;
}

function extractSnippet(content: string, query: string, contextChars = 120): string {
	const lower = content.toLowerCase();
	const queryLower = query.toLowerCase();
	const idx = lower.indexOf(queryLower);
	if (idx === -1) return content.slice(0, contextChars * 2);
	const start = Math.max(0, idx - contextChars);
	const end = Math.min(content.length, idx + query.length + contextChars);
	let snippet = content.slice(start, end);
	if (start > 0) snippet = '...' + snippet;
	if (end < content.length) snippet += '...';
	return snippet;
}

function formatMetadata(cache: CachedMetadata, file: TFile): string {
	const parts: string[] = [];

	// Frontmatter
	if (cache.frontmatter) {
		parts.push('Frontmatter: ' + JSON.stringify(cache.frontmatter));
	}

	// Tags
	const tags: string[] = [];
	const frontmatterTags: unknown = cache.frontmatter?.tags;
	if (frontmatterTags !== undefined && frontmatterTags !== null) {
		const values = Array.isArray(frontmatterTags) ? frontmatterTags : [frontmatterTags];
		for (const value of values) {
			const text = String(value).trim();
			if (text) tags.push(text);
		}
	}
	if (cache.tags) {
		for (const t of cache.tags) tags.push(t.tag);
	}
	if (tags.length > 0) {
		parts.push('Tags: ' + tags.join(', '));
	}

	// Links
	if (cache.links && cache.links.length > 0) {
		const links = cache.links.map(l => l.link);
		parts.push('Links: ' + links.join(', '));
	}

	// Headings
	if (cache.headings && cache.headings.length > 0) {
		const headings = cache.headings.map(h => '#'.repeat(h.level) + ' ' + h.heading);
		parts.push('Headings:\n' + headings.join('\n'));
	}

	parts.push(`File: ${file.path}`);
	parts.push(`Size: ${file.stat.size} bytes`);
	parts.push(`Modified: ${new Date(file.stat.mtime).toISOString()}`);

	return parts.join('\n\n');
}

export function createVaultTools(app: App): Tool<unknown>[] {
	const searchVault = defineTool<SearchVaultArgs>('search_vault', {
		description: 'Full-text search across all notes in the vault. Returns matching file names and content snippets.',
		parameters: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Search query string' },
				limit: { type: 'number', description: 'Maximum number of results (default 10)' },
			},
			required: ['query'],
		},
		handler: async (args) => {
			if (typeof args.query !== 'string') return 'Invalid query parameter.';
			const { query, limit = 10 } = args;
			if (!query.trim()) return 'Please provide a non-empty search query.';

			const files = app.vault.getMarkdownFiles().sort((a, b) => b.stat.mtime - a.stat.mtime);
			const loadingNotice = files.length > 100
				? new Notice(`Searching ${files.length} notes...`, 0)
				: null;
			const results: { path: string; snippet: string }[] = [];
			const queryLower = query.toLowerCase();
			const matchFn = queryLower.length <= 3
				? (text: string) => new RegExp('\\b' + queryLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(text)
				: (text: string) => text.toLowerCase().includes(queryLower);

			for (const file of files) {
				if (results.length >= limit) break;
				// cachedRead is fine for read-only search
				const content = await app.vault.cachedRead(file);
				if (matchFn(content)) {
					results.push({
						path: file.path,
						snippet: extractSnippet(content, query),
					});
				}
			}

			loadingNotice?.hide();
			if (results.length === 0) return `No notes found matching "${query}".`;
			return results.map(r => `**${r.path}**\n${r.snippet}`).join('\n\n---\n\n');
		},
	});

	const readNote = defineTool<ReadNoteArgs>('read_note', {
		description: 'Read the full content of a specific note. Input is the file path relative to vault root.',
		parameters: {
			type: 'object',
			properties: {
				path: { type: 'string', description: 'File path relative to vault root (e.g. "folder/note.md")' },
			},
			required: ['path'],
		},
		handler: async (args) => {
			if (typeof args.path !== 'string') return 'Invalid path parameter.';
			const file = resolveFile(app, args.path);
			if (!file) return `File not found: ${args.path}`;
			// Use read() not cachedRead() to get actual disk content
			const content = await app.vault.read(file);
			const MAX_LENGTH = 10240;
			if (content.length > MAX_LENGTH) {
				const truncated = content.slice(0, MAX_LENGTH);
				return `# ${file.basename}\nPath: ${file.path}\n\n${truncated}\n\n[Content truncated — showing ${MAX_LENGTH} of ${content.length} characters. Ask to read specific sections if needed.]\n\n⚠️ WARNING: This content is truncated. You MUST NOT use write_note mode="replace" on this note — doing so would destroy content beyond the truncation point. Use mode="patch" or mode="append" for targeted edits instead.`;
			}
			return `# ${file.basename}\nPath: ${file.path}\n\n${content}`;
		},
	});

	const listNotes = defineTool<ListNotesArgs>('list_notes', {
		description: 'List notes in the vault. Optionally filter by folder path or tag.',
		parameters: {
			type: 'object',
			properties: {
				folder: { type: 'string', description: 'Folder path to list (e.g. "daily-notes"). Omit for all notes.' },
				tag: { type: 'string', description: 'Filter by tag (e.g. "#project" or "project")' },
			},
		},
		handler: async (args) => {
			if (args.folder !== undefined && typeof args.folder !== 'string') return 'Invalid folder parameter.';
			if (args.tag !== undefined && typeof args.tag !== 'string') return 'Invalid tag parameter.';
			let files = app.vault.getMarkdownFiles();

			if (args.folder) {
				const folderPath = args.folder.replace(/\/$/, '');
				files = files.filter(f => f.path.startsWith(folderPath + '/') || f.path === folderPath);
			}

			if (args.tag) {
				const tagNormalized = args.tag.startsWith('#') ? args.tag : `#${args.tag}`;
				files = files.filter(f => {
					const cache = app.metadataCache.getFileCache(f);
					if (!cache) return false;
					// Check inline tags
					if (cache.tags?.some(t => t.tag === tagNormalized)) return true;
						// Check frontmatter tags
						const fmTagsRaw: unknown = cache.frontmatter?.tags;
						if (fmTagsRaw !== undefined && fmTagsRaw !== null) {
							const fmTags = Array.isArray(fmTagsRaw) ? fmTagsRaw : [fmTagsRaw];
							const tagName = tagNormalized.slice(1); // remove #
							if (fmTags.some(t => {
								const text = String(t).trim();
								return text === tagName || text === tagNormalized;
							})) return true;
						}
					return false;
				});
			}

			if (files.length === 0) return 'No notes found matching the criteria.';

			// Sort by modification time (newest first)
			files.sort((a, b) => b.stat.mtime - a.stat.mtime);

			const maxList = 50;
			const listed = files.slice(0, maxList);
			const lines = listed.map(f => `- ${f.path} (${f.basename})`);
			if (files.length > maxList) {
				lines.push(`\n... and ${files.length - maxList} more notes`);
			}
			return `Found ${files.length} notes:\n${lines.join('\n')}`;
		},
	});

	const getNoteMetadata = defineTool<GetNoteMetadataArgs>('get_note_metadata', {
		description: 'Get frontmatter, tags, links, and headings for a note.',
		parameters: {
			type: 'object',
			properties: {
				path: { type: 'string', description: 'File path relative to vault root' },
			},
			required: ['path'],
		},
		handler: async (args) => {
			if (typeof args.path !== 'string') return 'Invalid path parameter.';
			const file = resolveFile(app, args.path);
			if (!file) return `File not found: ${args.path}`;
			const cache = app.metadataCache.getFileCache(file);
			if (!cache) return `No cached metadata for: ${args.path}`;
			return formatMetadata(cache, file);
		},
	});

	const getBacklinks = defineTool<GetBacklinksArgs>('get_backlinks', {
		description: 'Find all notes that link to a given note.',
		parameters: {
			type: 'object',
			properties: {
				path: { type: 'string', description: 'File path relative to vault root' },
			},
			required: ['path'],
		},
		handler: async (args) => {
			if (typeof args.path !== 'string') return 'Invalid path parameter.';
			const file = resolveFile(app, args.path);
			if (!file) return `File not found: ${args.path}`;

			const backlinks: string[] = [];
			const resolvedLinks = app.metadataCache.resolvedLinks;

			for (const [sourcePath, links] of Object.entries(resolvedLinks)) {
				if (file.path in links) {
					backlinks.push(sourcePath);
				}
			}

			if (backlinks.length === 0) return `No notes link to ${args.path}.`;
			return `Notes linking to ${args.path}:\n${backlinks.map(b => `- ${b}`).join('\n')}`;
		},
	});

	const createNote = defineTool<{ path: string; content: string }>('create_note', {
		description: 'Create a new note in the vault. Fails if the file already exists. Parent folders are created automatically.',
		parameters: {
			type: 'object',
			properties: {
				path: { type: 'string', description: 'File path relative to vault root (e.g. "folder/note.md"). Must end in .md' },
				content: { type: 'string', description: 'Markdown content for the new note' },
			},
			required: ['path', 'content'],
		},
		handler: async (args) => {
			if (typeof args.path !== 'string' || typeof args.content !== 'string') return 'Invalid parameters.';
			const filePath = args.path.endsWith('.md') ? args.path : `${args.path}.md`;
			if (app.vault.getAbstractFileByPath(filePath)) return `File already exists: ${filePath}`;

			const parts = filePath.split('/');
			if (parts.length > 1) {
				let current = '';
				for (const seg of parts.slice(0, -1)) {
					current = current ? `${current}/${seg}` : seg;
					if (!app.vault.getAbstractFileByPath(current)) {
						await app.vault.createFolder(current);
					}
				}
			}

			await app.vault.create(filePath, args.content);
			new Notice(`Vilot created: ${filePath}`);
			return `Created: ${filePath}`;
		},
	});

	const writeNote = defineTool<{ path: string; mode: string; content: string; find?: string }>('write_note', {
		description: 'Write to an existing note. Three modes:\n'
			+ '- mode="append": Add content to the END of the note. Best for adding new sections, tasks, or updates.\n'
			+ '- mode="patch": Find and replace specific text. Requires "find" param with exact text to match (must match once). Best for targeted edits.\n'
			+ '- mode="replace": Overwrite the entire note. Use ONLY for full restructuring.\n'
			+ 'ALWAYS call read_note first before writing.',
		parameters: {
			type: 'object',
			properties: {
				path: { type: 'string', description: 'File path relative to vault root' },
				mode: { type: 'string', description: '"append", "patch", or "replace"' },
				content: { type: 'string', description: 'For append: content to add. For patch: replacement text. For replace: complete new content.' },
				find: { type: 'string', description: 'For patch mode only: exact text to find and replace (must match exactly once)' },
			},
			required: ['path', 'mode', 'content'],
		},
		handler: async (args) => {
			if (typeof args.path !== 'string' || typeof args.mode !== 'string' || typeof args.content !== 'string') {
				return 'Invalid parameters.';
			}
			const file = resolveFile(app, args.path);
			if (!file) return `File not found: ${args.path}`;

			const mode = args.mode.toLowerCase();

			try {
				if (mode === 'append') {
					await app.vault.process(file, (existing) => existing + '\n' + args.content);
					// Verify write succeeded
					const after = await app.vault.read(file);
					if (!after.includes(args.content)) {
						return `ERROR: Append appeared to succeed but content not found in file. File may be locked or sync conflict.`;
					}
					new Notice(`Vilot appended to: ${file.path}`);
					return `Appended to: ${file.path} (verified, file is now ${after.length} chars)`;
				}

				if (mode === 'patch') {
					if (typeof args.find !== 'string' || !args.find) {
						return 'Patch mode requires the "find" parameter with the exact text to replace.';
					}
					const content = await app.vault.read(file);
					const occurrences = content.split(args.find).length - 1;
					if (occurrences === 0) {
						return `Text not found in ${args.path}. Make sure the find string matches exactly. Use read_note to check current content.`;
					}
					if (occurrences > 1) {
						return `Found ${occurrences} matches — include more surrounding context to narrow to exactly one match.`;
					}
					const patched = content.replace(args.find, args.content);
					const approved = await confirmWrite(app, file, content, patched, 'Patch note');
					if (!approved) return `User rejected patch for: ${file.path}`;
					await app.vault.modify(file, patched);
					new Notice(`Vilot patched: ${file.path}`);
					return `Patched: ${file.path}`;
				}

				if (mode === 'replace') {
					const existing = await app.vault.read(file);
					if (existing.length > 100 && args.content.length < existing.length * 0.5) {
						return `Warning: new content is much shorter than existing. Use mode="append" to add content, or include full existing content.`;
					}
					const approved = await confirmWrite(app, file, existing, args.content, 'Replace note');
					if (!approved) return `User rejected replacement for: ${file.path}`;
					await app.vault.modify(file, args.content);
					new Notice(`Vilot replaced: ${file.path}`);
					return `Replaced content of: ${file.path}`;
				}

				return `Unknown mode "${args.mode}". Use "append", "patch", or "replace".`;
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				console.error('Vilot write_note error:', msg);
				return `ERROR writing to ${args.path}: ${msg}`;
			}
		},
	});

	const proposeEdit = defineTool<ProposeEditArgs>('propose_edit', {
		description: 'Propose a targeted edit for a note using one exact search/replace operation. '
			+ 'Does not modify files. Returns a structured edit proposal for user approval in chat.',
		parameters: {
			type: 'object',
			properties: {
				path: { type: 'string', description: 'File path relative to vault root' },
				description: { type: 'string', description: 'Short summary of the intended edit' },
				search: { type: 'string', description: 'Exact text to find (must match exactly once)' },
				replace: { type: 'string', description: 'Replacement text for the matched block' },
			},
			required: ['path', 'description', 'search', 'replace'],
		},
		handler: async (args) => {
			if (
				typeof args.path !== 'string'
				|| typeof args.description !== 'string'
				|| typeof args.search !== 'string'
				|| typeof args.replace !== 'string'
			) {
				return 'Invalid parameters.';
			}

			const file = resolveFile(app, args.path);
			if (!file) return `File not found: ${args.path}`;

			const originalContent = await app.vault.read(file);
			const { proposal, error } = buildEditProposalFromSearchReplace(
				{
					path: file.path,
					description: args.description.trim() || 'Proposed edit',
					search: args.search,
					replace: args.replace,
				},
				originalContent,
			);

			if (error || !proposal) {
				return `ERROR: ${error ?? 'Could not build proposal.'}`;
			}

			return JSON.stringify(proposal);
		},
	});

	return [searchVault, readNote, listNotes, getNoteMetadata, getBacklinks, createNote, proposeEdit, writeNote];
}
