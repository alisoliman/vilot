import { stripCodeFences } from './utils';
import { computeLineDiff } from './utils/diff';
export type { DiffLine } from './utils/diff';

export interface EditProposal {
	path: string;
	description: string;
	originalContent: string;
	proposedContent: string;
	status: 'pending' | 'accepted' | 'rejected';
}

export interface ProposeEditArgs {
	path: string;
	description: string;
	search: string;
	replace: string;
}

export function createEditProposal(
	path: string,
	description: string,
	originalContent: string,
	proposedContent: string,
): EditProposal {
	return {
		path,
		description,
		originalContent,
		proposedContent,
		status: 'pending',
	};
}

export function buildEditProposalFromSearchReplace(
	args: ProposeEditArgs,
	originalContent: string,
): { proposal: EditProposal | null; error: string | null } {
	if (!args.search) {
		return {
			proposal: null,
			error: 'propose_edit requires a non-empty search string.',
		};
	}

	const occurrences = originalContent.split(args.search).length - 1;
	if (occurrences === 0) {
		return {
			proposal: null,
			error: `Search text not found in ${args.path}.`,
		};
	}
	if (occurrences > 1) {
		return {
			proposal: null,
			error: `Search text matched ${occurrences} locations in ${args.path}. Include more context for a single targeted edit.`,
		};
	}

	const proposedContent = originalContent.replace(args.search, args.replace);
	if (proposedContent === originalContent) {
		return {
			proposal: null,
			error: 'Edit produced no change.',
		};
	}

	return {
		proposal: createEditProposal(args.path, args.description, originalContent, proposedContent),
		error: null,
	};
}

function asStringRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

/** Try to extract a JSON object from text that may contain LLM commentary around it. */
function extractJson(text: string): unknown {
	// Try direct parse first
	try { return JSON.parse(text); } catch { /* continue */ }

	// Try to find a JSON object within the text
	const firstBrace = text.indexOf('{');
	const lastBrace = text.lastIndexOf('}');
	if (firstBrace !== -1 && lastBrace > firstBrace) {
		try { return JSON.parse(text.slice(firstBrace, lastBrace + 1)); } catch { /* continue */ }
	}

	return null;
}

export function parseEditProposalFromResult(rawResult: string): EditProposal | null {
	const text = stripCodeFences(rawResult);
	const parsed = extractJson(text);

	const obj = asStringRecord(parsed);
	if (!obj) return null;
	if (typeof obj.path !== 'string' || typeof obj.originalContent !== 'string' || typeof obj.proposedContent !== 'string') {
		return null;
	}

	const status = obj.status === 'accepted' || obj.status === 'rejected' ? obj.status : 'pending';
	const description = typeof obj.description === 'string' ? obj.description : 'Proposed edit';

	return {
		path: obj.path,
		description,
		originalContent: obj.originalContent,
		proposedContent: obj.proposedContent,
		status,
	};
}

export const computeProposalDiff = computeLineDiff;

export function summarizeToolResult(result: string, limit = 200): string {
	const normalized = result.replace(/\s+/g, ' ').trim();
	if (normalized.length <= limit) return normalized;
	return `${normalized.slice(0, limit)}...`;
}
