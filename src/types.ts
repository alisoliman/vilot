export interface MCPServerEntry {
	type?: 'local' | 'stdio' | 'http' | 'sse';
	command?: string;
	args?: string[];
	env?: Record<string, string>;
	cwd?: string;
	url?: string;
	headers?: Record<string, string>;
	tools: string[];
}

export interface VilotSettings {
	model: string;
	cliPath: string;
	hiddenModels: string[];
	chatHistory: ChatMessage[];
	conversationsFolder: string;
	/** MCP servers config — JSON string stored in settings, parsed at runtime */
	mcpServersJson: string;
	/** Directories containing Copilot skill definitions */
	skillDirectories: string[];
	/** Disabled skill names (applies to built-in and user skills) */
	disabledSkills: string[];
	/** Indicates whether the first-run setup wizard was completed */
	setupComplete: boolean;
}

export const DEFAULT_SETTINGS: VilotSettings = {
	model: 'claude-opus-4.6',
	cliPath: '',
	hiddenModels: [],
	chatHistory: [],
	conversationsFolder: 'Vilot/Conversations',
	mcpServersJson: '{}',
	skillDirectories: [],
	disabledSkills: [],
	setupComplete: false,
};

export const FALLBACK_MODELS: ModelOption[] = [
	{ value: 'claude-opus-4.6', label: 'Claude Opus 4.6' },
	{ value: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5' },
	{ value: 'claude-sonnet-4', label: 'Claude Sonnet 4' },
	{ value: 'gpt-5', label: 'GPT-5' },
	{ value: 'gpt-5.1', label: 'GPT-5.1' },
	{ value: 'o3', label: 'o3' },
	{ value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
];

export interface ModelOption {
	value: string;
	label: string;
}

export type MessageRole = 'user' | 'assistant';

export interface ChatMessage {
	role: MessageRole;
	content: string;
	noteTitle: string | null;
	timestamp: number;
}

export interface NoteContext {
	/** Absolute file path on disk */
	absolutePath: string;
	/** Display name (basename without extension) */
	title: string;
}
