import { describe, expect, it } from 'vitest';
import { FileSystemAdapter, TFile } from 'obsidian';
import { getFilesByTag, resolveMentions } from '../src/ui/mention-resolver';

interface MockTag {
	tag: string;
}

interface MockFileCache {
	tags?: MockTag[];
	frontmatter?: {
		tags?: string[] | string;
	};
}

function makeFile(path: string): TFile {
	const file = new TFile();
	file.path = path;
	const lastSegment = path.split('/').pop() ?? path;
	file.basename = lastSegment.replace(/\.md$/i, '');
	file.extension = 'md';
	return file;
}

function makeApp(files: TFile[], fileCacheMap: Map<string, MockFileCache> = new Map()): unknown {
	return {
		vault: {
			adapter: new FileSystemAdapter(),
			getMarkdownFiles: () => files,
			getAbstractFileByPath: (path: string) =>
				files.find(file => file.path === path || file.path === `${path}.md`) ?? null,
		},
		metadataCache: {
			getFileCache: (file: TFile) => fileCacheMap.get(file.path) ?? null,
		},
	};
}

describe('resolveMentions', () => {
	it('resolves folder mentions even when higher-level folder prefix is omitted', () => {
		const files = [
			makeFile('Workspace/Projects/ClientA/Questions about TTS.md'),
			makeFile('Workspace/Projects/ClientA/2025-01-14.md'),
			makeFile('Daily/2026-02-22.md'),
		];
		const app = makeApp(files);
		const result = resolveMentions(
			app as never,
			'@"Projects/ClientA/" summarize this folder',
		);
		expect(result.contexts).toHaveLength(2);
		expect(result.contexts.map(c => c.title).sort()).toEqual([
			'2025-01-14',
			'Questions about TTS',
		]);
	});
});

describe('getFilesByTag', () => {
	it('matches inline and frontmatter tags case-insensitively', () => {
		const alpha = makeFile('Work/Alpha.md');
		const beta = makeFile('Work/Beta.md');
		const gamma = makeFile('Work/Gamma.md');
		const files = [alpha, beta, gamma];
		const cacheMap = new Map<string, MockFileCache>([
			[alpha.path, { tags: [{ tag: '#project' }] }],
			[beta.path, { frontmatter: { tags: ['PROJECT'] } }],
			[gamma.path, { tags: [{ tag: '#other' }] }],
		]);
		const app = makeApp(files, cacheMap);
		const matches = getFilesByTag(app as never, 'Project', files);
		expect(matches.map(f => f.path).sort()).toEqual([
			'Work/Alpha.md',
			'Work/Beta.md',
		]);
	});
});
