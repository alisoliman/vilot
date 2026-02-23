import { describe, it, expect } from 'vitest';
import {
	buildEditProposalFromSearchReplace,
	parseEditProposalFromResult,
	computeProposalDiff,
} from '../src/composer';

describe('buildEditProposalFromSearchReplace', () => {
	it('returns error for empty search', () => {
		const result = buildEditProposalFromSearchReplace(
			{ path: 'test.md', description: 'test', search: '', replace: 'new' },
			'original content',
		);
		expect(result.error).toContain('non-empty search');
		expect(result.proposal).toBeNull();
	});

	it('returns error when search text not found', () => {
		const result = buildEditProposalFromSearchReplace(
			{ path: 'test.md', description: 'test', search: 'missing', replace: 'new' },
			'original content',
		);
		expect(result.error).toContain('not found');
		expect(result.proposal).toBeNull();
	});

	it('returns error for multiple matches', () => {
		const result = buildEditProposalFromSearchReplace(
			{ path: 'test.md', description: 'test', search: 'a', replace: 'b' },
			'a a a',
		);
		expect(result.error).toContain('3 locations');
		expect(result.proposal).toBeNull();
	});

	it('returns proposal for single match', () => {
		const result = buildEditProposalFromSearchReplace(
			{ path: 'test.md', description: 'Fix typo', search: 'helo', replace: 'hello' },
			'Say helo world',
		);
		expect(result.error).toBeNull();
		expect(result.proposal).not.toBeNull();
		expect(result.proposal!.path).toBe('test.md');
		expect(result.proposal!.proposedContent).toBe('Say hello world');
		expect(result.proposal!.status).toBe('pending');
	});

	it('returns error when edit produces no change', () => {
		const result = buildEditProposalFromSearchReplace(
			{ path: 'test.md', description: 'test', search: 'same', replace: 'same' },
			'same content',
		);
		expect(result.error).toContain('no change');
	});
});

describe('parseEditProposalFromResult', () => {
	it('parses valid JSON result', () => {
		const json = JSON.stringify({
			path: 'note.md',
			description: 'Fix heading',
			originalContent: '# Old',
			proposedContent: '# New',
			status: 'pending',
		});
		const result = parseEditProposalFromResult(json);
		expect(result).not.toBeNull();
		expect(result!.path).toBe('note.md');
		expect(result!.proposedContent).toBe('# New');
	});

	it('strips code fences before parsing', () => {
		const json = '```json\n' + JSON.stringify({
			path: 'note.md',
			description: 'test',
			originalContent: 'old',
			proposedContent: 'new',
		}) + '\n```';
		const result = parseEditProposalFromResult(json);
		expect(result).not.toBeNull();
		expect(result!.path).toBe('note.md');
	});

	it('returns null for invalid JSON', () => {
		expect(parseEditProposalFromResult('not json at all')).toBeNull();
	});

	it('extracts JSON from LLM commentary', () => {
		const json = JSON.stringify({
			path: 'note.md',
			description: 'test',
			originalContent: 'old',
			proposedContent: 'new',
		});
		const withCommentary = `Here is the proposed edit:\n${json}\nLet me know if you want changes.`;
		const result = parseEditProposalFromResult(withCommentary);
		expect(result).not.toBeNull();
		expect(result!.path).toBe('note.md');
	});

	it('returns null for missing required fields', () => {
		expect(parseEditProposalFromResult(JSON.stringify({ path: 'x' }))).toBeNull();
	});
});

describe('computeProposalDiff', () => {
	it('detects added lines', () => {
		const diff = computeProposalDiff('line1', 'line1\nline2');
		const added = diff.filter(l => l.type === 'added');
		expect(added.length).toBe(1);
		expect(added[0]!.text).toBe('line2');
	});

	it('detects removed lines', () => {
		const diff = computeProposalDiff('line1\nline2', 'line1');
		const removed = diff.filter(l => l.type === 'removed');
		expect(removed.length).toBe(1);
		expect(removed[0]!.text).toBe('line2');
	});

	it('handles identical content', () => {
		const diff = computeProposalDiff('same', 'same');
		expect(diff.every(l => l.type === 'unchanged')).toBe(true);
	});
});
