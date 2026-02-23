export interface ToolCallGuardDecision {
	allow: boolean;
	reason?: string;
	additionalContext?: string;
}

export interface ToolCallGuardOptions {
	maxCallsPerRequest?: number;
	maxDuplicateSignatureCalls?: number;
	unguardedTools?: string[];
}

interface ToolGuardState {
	totalCalls: number;
	signatureCounts: Map<string, number>;
}

function normalizePathLike(value: string): string {
	const normalized = value.trim().replace(/\\/g, '/').replace(/\/+/g, '/');
	return normalized.replace(/^\.\//, '').replace(/\/$/, '');
}

function canonicalizeToolArgs(toolName: string, toolArgs: unknown): unknown {
	if (!toolArgs || typeof toolArgs !== 'object' || Array.isArray(toolArgs)) {
		return toolArgs;
	}

	const normalized = { ...(toolArgs as Record<string, unknown>) };

	const pathArg = normalized['path'];
	if (typeof pathArg === 'string') {
		normalized['path'] = normalizePathLike(pathArg);
	}

	const folderArg = normalized['folder'];
	if (typeof folderArg === 'string') {
		normalized['folder'] = normalizePathLike(folderArg);
	}

	const tagArg = normalized['tag'];
	if (typeof tagArg === 'string') {
		const trimmed = tagArg.trim();
		const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
		normalized['tag'] = withHash.toLowerCase();
	}

	if (toolName === 'search_vault' && typeof normalized['query'] === 'string') {
		normalized['query'] = normalized['query'].trim().replace(/\s+/g, ' ').toLowerCase();
	}

	return normalized;
}

function stableStringify(value: unknown): string {
	if (value === null || typeof value !== 'object') {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(',')}]`;
	}
	const entries = Object.entries(value as Record<string, unknown>)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`);
	return `{${entries.join(',')}}`;
}

export class ToolCallGuard {
	private readonly maxCallsPerRequest: number;
	private readonly maxDuplicateSignatureCalls: number;
	private readonly unguardedTools: Set<string>;
	private state: ToolGuardState;

	constructor(options: ToolCallGuardOptions = {}) {
		this.maxCallsPerRequest = options.maxCallsPerRequest ?? 20;
		this.maxDuplicateSignatureCalls = options.maxDuplicateSignatureCalls ?? 2;
		this.unguardedTools = new Set((options.unguardedTools ?? []).map(name => name.trim()).filter(Boolean));
		this.state = {
			totalCalls: 0,
			signatureCounts: new Map<string, number>(),
		};
	}

	reset(): void {
		this.state = {
			totalCalls: 0,
			signatureCounts: new Map<string, number>(),
		};
	}

	evaluate(toolName: string, toolArgs: unknown): ToolCallGuardDecision {
		if (this.unguardedTools.has(toolName)) {
			return { allow: true };
		}

		this.state.totalCalls += 1;
		if (this.state.totalCalls > this.maxCallsPerRequest) {
			return {
				allow: false,
				reason: `Tool call limit reached (${this.maxCallsPerRequest})`,
				additionalContext: 'Stop calling more tools and provide your best final answer using the results already gathered.',
			};
		}

		const signature = `${toolName}:${stableStringify(canonicalizeToolArgs(toolName, toolArgs))}`;
		const nextCount = (this.state.signatureCounts.get(signature) ?? 0) + 1;
		this.state.signatureCounts.set(signature, nextCount);

		if (nextCount > this.maxDuplicateSignatureCalls) {
			return {
				allow: false,
				reason: `Repeated identical ${toolName} call blocked`,
				additionalContext: 'You already called this tool with identical arguments. Reuse prior results or explain why a changed call is needed.',
			};
		}

		return { allow: true };
	}
}
