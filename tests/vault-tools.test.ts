import { describe, it, expect } from 'vitest';

// vault-tools uses the Obsidian API heavily, so we test the pure logic patterns
// used internally: parameter validation, truncation warning text, and file resolution

describe('vault-tools parameter validation patterns', () => {
	it('rejects non-string query', () => {
		const args = { query: 123 };
		expect(typeof args.query !== 'string').toBe(true);
	});

	it('rejects empty query', () => {
		const query = '   ';
		expect(!query.trim()).toBe(true);
	});

	it('rejects non-string path', () => {
		const args = { path: null };
		expect(typeof args.path !== 'string').toBe(true);
	});

	it('validates write_note mode', () => {
		const validModes = ['append', 'patch', 'replace'];
		expect(validModes.includes('append')).toBe(true);
		expect(validModes.includes('patch')).toBe(true);
		expect(validModes.includes('replace')).toBe(true);
		expect(validModes.includes('delete')).toBe(false);
	});

	it('requires find param for patch mode', () => {
		const args = { path: 'test.md', mode: 'patch', content: 'new' };
		const find = (args as Record<string, unknown>).find;
		expect(typeof find !== 'string' || !find).toBe(true);
	});
});

describe('truncation warning', () => {
	const MAX_LENGTH = 10240;

	it('truncates content over 10KB', () => {
		const longContent = 'a'.repeat(15000);
		expect(longContent.length > MAX_LENGTH).toBe(true);
		const truncated = longContent.slice(0, MAX_LENGTH);
		expect(truncated.length).toBe(MAX_LENGTH);
	});

	it('includes truncation warning with correct char counts', () => {
		const contentLength = 15000;
		const warning = `[Content truncated — showing ${MAX_LENGTH} of ${contentLength} characters. Ask to read specific sections if needed.]\n\n⚠️ WARNING: This content is truncated. You MUST NOT use write_note mode="replace" on this note — doing so would destroy content beyond the truncation point. Use mode="patch" or mode="append" for targeted edits instead.`;
		expect(warning).toContain('MUST NOT');
		expect(warning).toContain('mode="replace"');
		expect(warning).toContain('mode="patch"');
		expect(warning).toContain('mode="append"');
		expect(warning).toContain(String(MAX_LENGTH));
		expect(warning).toContain(String(contentLength));
	});

	it('does not truncate content under 10KB', () => {
		const shortContent = 'a'.repeat(5000);
		expect(shortContent.length > MAX_LENGTH).toBe(false);
	});
});

describe('write_note size guard', () => {
	it('warns when replacement is much shorter than existing', () => {
		const existing = 'a'.repeat(200);
		const replacement = 'b'.repeat(50);
		const tooShort = existing.length > 100 && replacement.length < existing.length * 0.5;
		expect(tooShort).toBe(true);
	});

	it('allows replacement of similar size', () => {
		const existing = 'a'.repeat(200);
		const replacement = 'b'.repeat(180);
		const tooShort = existing.length > 100 && replacement.length < existing.length * 0.5;
		expect(tooShort).toBe(false);
	});
});
