import { describe, expect, it } from 'vitest';
import { ToolCallGuard } from '../src/tool-call-guard';

describe('ToolCallGuard', () => {
	it('blocks repeated identical tool calls after threshold', () => {
		const guard = new ToolCallGuard({ maxDuplicateSignatureCalls: 2 });
		expect(guard.evaluate('read_note', { path: 'notes/a.md' }).allow).toBe(true);
		expect(guard.evaluate('read_note', { path: 'notes/a.md' }).allow).toBe(true);
		const blocked = guard.evaluate('read_note', { path: 'notes/a.md' });
		expect(blocked.allow).toBe(false);
		expect(blocked.reason).toContain('Repeated identical');
	});

	it('normalizes path-like arguments when checking duplicates', () => {
		const guard = new ToolCallGuard({ maxDuplicateSignatureCalls: 1 });
		expect(guard.evaluate('read_note', { path: './notes//a.md/' }).allow).toBe(true);
		const blocked = guard.evaluate('read_note', { path: 'notes/a.md' });
		expect(blocked.allow).toBe(false);
	});

	it('normalizes search query whitespace and case', () => {
		const guard = new ToolCallGuard({ maxDuplicateSignatureCalls: 1 });
		expect(guard.evaluate('search_vault', { query: 'Open  tasks' }).allow).toBe(true);
		const blocked = guard.evaluate('search_vault', { query: ' open tasks ' });
		expect(blocked.allow).toBe(false);
	});

	it('enforces max calls per request', () => {
		const guard = new ToolCallGuard({ maxCallsPerRequest: 2, maxDuplicateSignatureCalls: 5 });
		expect(guard.evaluate('search_vault', { query: 'a' }).allow).toBe(true);
		expect(guard.evaluate('search_vault', { query: 'b' }).allow).toBe(true);
		const blocked = guard.evaluate('search_vault', { query: 'c' });
		expect(blocked.allow).toBe(false);
		expect(blocked.reason).toContain('limit');
	});

	it('reset clears counters', () => {
		const guard = new ToolCallGuard({ maxCallsPerRequest: 1, maxDuplicateSignatureCalls: 1 });
		expect(guard.evaluate('read_note', { path: 'a.md' }).allow).toBe(true);
		expect(guard.evaluate('read_note', { path: 'b.md' }).allow).toBe(false);
		guard.reset();
		expect(guard.evaluate('read_note', { path: 'b.md' }).allow).toBe(true);
	});

	it('skips guard checks for unguarded tools', () => {
		const guard = new ToolCallGuard({
			maxCallsPerRequest: 1,
			maxDuplicateSignatureCalls: 1,
			unguardedTools: ['read_memory'],
		});
		expect(guard.evaluate('read_memory', {}).allow).toBe(true);
		expect(guard.evaluate('read_memory', {}).allow).toBe(true);
		expect(guard.evaluate('search_vault', { query: 'a' }).allow).toBe(true);
		expect(guard.evaluate('search_vault', { query: 'b' }).allow).toBe(false);
	});
});
