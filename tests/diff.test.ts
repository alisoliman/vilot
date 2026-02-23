import { describe, it, expect } from 'vitest';
import { computeLineDiff } from '../src/utils/diff';

describe('computeLineDiff', () => {
	it('returns all unchanged for identical text', () => {
		const diff = computeLineDiff('hello\nworld', 'hello\nworld');
		expect(diff.every(l => l.type === 'unchanged')).toBe(true);
		expect(diff.length).toBe(2);
	});

	it('detects a single line change', () => {
		const diff = computeLineDiff('line1\nold\nline3', 'line1\nnew\nline3');
		expect(diff.filter(l => l.type === 'removed')).toEqual([{ type: 'removed', text: 'old' }]);
		expect(diff.filter(l => l.type === 'added')).toEqual([{ type: 'added', text: 'new' }]);
	});

	it('detects added lines', () => {
		const diff = computeLineDiff('a\nb', 'a\nb\nc');
		const added = diff.filter(l => l.type === 'added');
		expect(added.length).toBe(1);
		expect(added[0]!.text).toBe('c');
	});

	it('detects removed lines', () => {
		const diff = computeLineDiff('a\nb\nc', 'a\nc');
		const removed = diff.filter(l => l.type === 'removed');
		expect(removed.length).toBe(1);
		expect(removed[0]!.text).toBe('b');
	});

	it('handles empty strings', () => {
		const diff = computeLineDiff('', 'new');
		expect(diff.filter(l => l.type === 'added').length).toBeGreaterThanOrEqual(1);
	});
});
