import { describe, it, expect } from 'vitest';

// Test frontmatter regex patterns used in note-actions.ts
// These are extracted since the functions require Obsidian API

describe('frontmatter regex', () => {
	const fmRegexOld = /^---\n([\s\S]*?)\n---\n/;
	const fmRegexFixed = /^---\n([\s\S]*?)\n---(?:\n|$)/;

	it('matches standard frontmatter with trailing newline', () => {
		const content = '---\ntags:\n  - test\n---\nBody content';
		expect(fmRegexOld.test(content)).toBe(true);
		expect(fmRegexFixed.test(content)).toBe(true);
	});

	it('old regex fails on frontmatter without trailing newline', () => {
		const content = '---\ntags:\n  - test\n---';
		expect(fmRegexOld.test(content)).toBe(false);
		expect(fmRegexFixed.test(content)).toBe(true);
	});

	it('fixed regex captures frontmatter content', () => {
		const content = '---\ntitle: Hello\ntags:\n  - foo\n---';
		const match = content.match(fmRegexFixed);
		expect(match).not.toBeNull();
		expect(match![1]).toContain('title: Hello');
	});
});

describe('summary insertion', () => {
	it('prepends summary section to content', () => {
		const summary = 'This is a test summary.';
		const oldContent = '# My Note\n\nSome content here.';
		const newContent = `## Summary\n\n${summary}\n\n${oldContent}`;
		expect(newContent).toContain('## Summary');
		expect(newContent).toContain(oldContent);
		expect(newContent.indexOf('## Summary')).toBeLessThan(newContent.indexOf('# My Note'));
	});
});

describe('tags YAML generation', () => {
	it('generates valid tag list', () => {
		const tags = ['project', 'ai', 'notes'];
		const tagsYaml = `tags:\n${tags.map(t => `  - ${t}`).join('\n')}`;
		expect(tagsYaml).toBe('tags:\n  - project\n  - ai\n  - notes');
	});
});
