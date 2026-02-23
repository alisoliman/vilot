import { existsSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { arch, env as processEnv, platform } from 'node:process';
import { CopilotClient, type CopilotSession, type MCPServerConfig, type Tool } from '@github/copilot-sdk';
import { Notice, Platform } from 'obsidian';
import { INTERNAL_TOOL_NAMES, NOTE_ACTION_SYSTEM_MESSAGE, SYSTEM_MESSAGE } from './constants';
import { ToolCallGuard } from './tool-call-guard';
import type { MCPServerEntry, ModelOption, NoteContext, VilotSettings } from './types';

const STREAM_IDLE_TIMEOUT_MS = 120_000;

/**
 * Find the native Copilot CLI binary in a given base directory.
 * Returns the path if found, or null.
 */
function findNativeBin(baseDir: string): string | null {
	const nativePkg = `@github/copilot-${platform}-${arch}`;
	const ext = Platform.isWin ? '.exe' : '';
	const bin = join(baseDir, 'node_modules', nativePkg, `copilot${ext}`);
	return existsSync(bin) ? bin : null;
}

/**
 * Resolve the Copilot CLI binary to use.
 *
 * Priority:
 * 1. User-provided override path (settings field)
 * 2. Platform-specific native binary shipped with @github/copilot
 *    (e.g. @github/copilot-darwin-arm64/copilot).
 *    Searched in the plugin directory, and — for symlinked dev setups —
 *    also in the real project directory that main.js resolves to.
 * 3. Bundled JS entry point as a last resort.
 */
function resolveCliPath(override: string, pluginDir: string): string {
	if (override) return override;

	// Check plugin dir first (production installs ship node_modules here)
	const fromPlugin = findNativeBin(pluginDir);
	if (fromPlugin) return fromPlugin;

	// Dev setup: main.js may be a symlink into the real project directory
	try {
		const realMain = realpathSync(join(pluginDir, 'main.js'));
		const projectRoot = dirname(realMain);
		if (projectRoot !== pluginDir) {
			const fromProject = findNativeBin(projectRoot);
			if (fromProject) return fromProject;
		}
	} catch { /* ignore — file may not exist */ }

	// Last resort fallback (only works outside Electron)
	return join(pluginDir, 'node_modules', '@github', 'copilot', 'index.js');
}

/**
 * Build an env with common tool paths added (Homebrew, npm global, etc).
 * Needed because Obsidian's GUI process has a minimal PATH that lacks
 * paths required by MCP servers (npx, node, python, etc).
 */
function buildEnv(): Record<string, string | undefined> {
	const env = { ...processEnv };
	const existing = env.PATH ?? '';
	const sep = Platform.isWin ? ';' : ':';
	const extras = Platform.isWin
		? []
		: [
			'/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin',
			'/usr/local/sbin', '/usr/bin', '/usr/sbin',
			'/snap/bin', '/home/linuxbrew/.linuxbrew/bin',
		];
	const missing = extras.filter(p => !existing.includes(p));
	if (missing.length) env.PATH = `${existing}${sep}${missing.join(sep)}`;
	return env;
}

function buildAttachments(notes: NoteContext[]): { type: 'file'; path: string; displayName: string }[] {
	return notes.map(n => ({ type: 'file' as const, path: n.absolutePath, displayName: n.title }));
}

function summarizeToolOutput(text: string, limit = 200): string {
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (normalized.length <= limit) return normalized;
	return `${normalized.slice(0, limit)}...`;
}

function getToolResultContent(result: {
	content: string;
	detailedContent?: string;
	contents?: Array<{ type: 'text'; text: string } | { type: string; text?: string }>;
} | undefined): string {
	if (!result) return '';
	if (typeof result.content === 'string' && result.content.trim()) return result.content;
	if (Array.isArray(result.contents)) {
		const joined = result.contents
			.map(item => ('text' in item && typeof item.text === 'string' ? item.text : ''))
			.filter(Boolean)
			.join('\n');
		if (joined.trim()) return joined;
	}
	if (typeof result.detailedContent === 'string') return result.detailedContent;
	return '';
}

export interface ToolUseEvent {
	toolName: string;
	toolCallId: string;
	args: Record<string, unknown>;
	timestampMs: number;
}

export interface ToolCompleteEvent {
	toolCallId: string;
	toolName: string;
	success: boolean;
	durationMs: number | null;
	args: Record<string, unknown>;
	resultSummary?: string;
	resultContent?: string;
}

export interface StreamCallbacks {
	onDelta: (delta: string) => void;
	onDone: (fullContent: string) => void;
	onError: (error: Error) => void;
	onToolUse?: (event: ToolUseEvent) => void;
	onToolComplete?: (event: ToolCompleteEvent) => void;
}

export class CopilotService {
	private client: CopilotClient | null = null;
	private session: CopilotSession | null = null;
	private started = false;
	private cliPathOverride = '';
	private pluginDir = '';
	private skillDirectories: string[] = [];
	private currentModel = '';
	private unsubscribeSession: (() => void) | null = null;
	private registeredTools: Tool<unknown>[] = [];
	private streamRequestSeq = 0;
	private activeStreamRequestId = 0;

	setPluginDir(dir: string) {
		this.pluginDir = dir;
	}

	async setCliPath(path: string): Promise<void> {
		if (path === this.cliPathOverride) return;
		this.cliPathOverride = path;
		// Restart (or start for the first time) with the new path
		if (this.started) {
			await this.stop();
		}
		await this.start();
	}

	setTools(tools: Tool<unknown>[]) {
		this.registeredTools = tools;
	}

	setSkillDirectories(directories: string[]) {
		this.skillDirectories = [...new Set(directories.map(d => d.trim()).filter(Boolean))];
	}

	async start(): Promise<void> {
		if (this.started) return;
		const cliPath = resolveCliPath(this.cliPathOverride, this.pluginDir);
		this.client = new CopilotClient({
			autoStart: false,
			cliPath,
			env: buildEnv(),
		});
		await this.client.start();
		this.started = true;
	}

	async stop(): Promise<void> {
		await this.destroySession();
		if (!this.started || !this.client) return;
		const errors = await this.client.stop();
		if (errors && errors.length > 0) {
			for (const err of errors) {
				console.warn('Vilot: error stopping Copilot client:', err);
			}
		}
		this.client = null;
		this.started = false;
	}

	get isStarted(): boolean {
		return this.started;
	}

	async isConnected(): Promise<boolean> {
		if (!this.started || !this.client) return false;
		try {
			await this.client.ping();
			return true;
		} catch {
			return false;
		}
	}

	async listModels(): Promise<ModelOption[]> {
		if (!this.started || !this.client) return [];
		try {
			const models = await this.client.listModels();
			return models.map(m => ({ value: m.id, label: m.name }));
		} catch (err) {
			console.warn('Vilot: failed to list models:', err);
			return [];
		}
	}

	/** Parse the user's MCP JSON config into the SDK's expected format. */
	private parseMcpServers(settings: VilotSettings): Record<string, MCPServerConfig> | undefined {
		try {
			const raw = JSON.parse(settings.mcpServersJson || '{}') as Record<string, MCPServerEntry>;
			const entries = Object.entries(raw);
			if (entries.length === 0) return undefined;
			const result: Record<string, MCPServerConfig> = {};
			for (const [name, cfg] of entries) {
				// Validate command exists for stdio/local servers
				if (cfg.command) {
					const cmd = cfg.command.trim();
					if (!cmd) {
						console.warn(`Vilot: MCP server "${name}" has empty command, skipping`);
						continue;
					}
					// Warn about untrusted servers
					new Notice(
						`Vilot: Spawning MCP server "${name}" (${cmd}). `
						+ 'Ensure you trust this server — it can execute arbitrary code.',
						8000,
					);
				} else if (!cfg.url) {
					console.warn(`Vilot: MCP server "${name}" has no command or url, skipping`);
					continue;
				}
				result[name] = cfg as unknown as MCPServerConfig;
			}
			if (Object.keys(result).length === 0) return undefined;
			return result;
		} catch {
			console.warn('Vilot: invalid MCP servers JSON, ignoring');
			return undefined;
		}
	}

	private async ensureSession(settings: VilotSettings): Promise<CopilotSession> {
		const model = settings.model;
		// Reuse existing session if model hasn't changed
		if (this.session && this.currentModel === model) {
			return this.session;
		}
		await this.destroySession();
		await this.start();

		const mcpServers = this.parseMcpServers(settings);
		const skillDirs = this.skillDirectories.length > 0
			? this.skillDirectories
			: settings.skillDirectories?.filter(s => s.trim());
		const disabledSkills = settings.disabledSkills?.filter(s => s.trim());
		const toolGuard = new ToolCallGuard({
			maxCallsPerRequest: 30,
			maxDuplicateSignatureCalls: 2,
			unguardedTools: [...INTERNAL_TOOL_NAMES],
		});

		this.session = await this.client!.createSession({
			model,
			systemMessage: { content: SYSTEM_MESSAGE },
			streaming: true,
			tools: this.registeredTools.length > 0 ? this.registeredTools : undefined,
			mcpServers: mcpServers,
			skillDirectories: skillDirs && skillDirs.length > 0 ? skillDirs : undefined,
			disabledSkills: disabledSkills && disabledSkills.length > 0 ? disabledSkills : undefined,
			hooks: {
				onUserPromptSubmitted: () => {
					toolGuard.reset();
					return {
						additionalContext: 'Use tools only when necessary, avoid repeated identical calls, and provide a final response once enough context is gathered.',
					};
				},
				onPreToolUse: (input) => {
					const decision = toolGuard.evaluate(input.toolName, input.toolArgs);
					if (!decision.allow) {
						return {
							permissionDecision: 'deny',
							permissionDecisionReason: decision.reason ?? 'Tool call denied by Vilot tool-use guardrails.',
							additionalContext: decision.additionalContext
								?? 'Stop calling tools and provide your best final answer from existing results.',
						};
					}
					return {
						permissionDecision: 'allow',
						additionalContext: 'Before calling another tool, verify that the previous result is insufficient for answering the user.',
					};
				},
				onPostToolUse: (input) => {
					const status = input.toolResult.resultType;
					const summary = summarizeToolOutput(input.toolResult.textResultForLlm ?? '', 180);
					return {
						additionalContext: summary
							? `Tool ${input.toolName} ${status}. Result summary: ${summary}. If this is enough, respond to the user now.`
							: `Tool ${input.toolName} ${status}. If you have enough information, respond to the user now.`,
					};
				},
			},
		});
		this.currentModel = model;
		return this.session;
	}

	private async destroySession(): Promise<void> {
		if (this.unsubscribeSession) {
			this.unsubscribeSession();
			this.unsubscribeSession = null;
		}
		if (this.session) {
			try { await this.session.destroy(); } catch { /* ignore */ }
			this.session = null;
			this.currentModel = '';
		}
	}

	async resetSession(): Promise<void> {
		await this.destroySession();
	}

	async sendStreaming(
		prompt: string,
		noteContexts: NoteContext[],
		settings: VilotSettings,
		callbacks: StreamCallbacks,
	): Promise<void> {
		const session = await this.ensureSession(settings);
		const requestId = ++this.streamRequestSeq;
		this.activeStreamRequestId = requestId;
		const isCurrentRequest = () => this.activeStreamRequestId === requestId;

		let fullContent = '';
		let lastAssistantMessageContent = '';
		let sawSessionError = false;
		let doneEmitted = false;
		let lastActivityMs = Date.now();
		let resolveIdle: (() => void) | null = null;
		let rejectIdle: ((error: Error) => void) | null = null;
		const idlePromise = new Promise<void>((resolve, reject) => {
			resolveIdle = resolve;
			rejectIdle = reject;
		});
		const toolStartMap = new Map<string, {
			toolName: string;
			args: Record<string, unknown>;
			startedAtMs: number;
		}>();
		const emitDone = () => {
			if (doneEmitted || sawSessionError || !isCurrentRequest()) return;
			doneEmitted = true;
			callbacks.onDone(fullContent || lastAssistantMessageContent);
		};
		if (this.unsubscribeSession) {
			this.unsubscribeSession();
			this.unsubscribeSession = null;
		}

		const unsub = session.on((event) => {
			if (event.type === 'assistant.message_delta') {
				lastActivityMs = Date.now();
				const delta = event.data.deltaContent;
				fullContent += delta;
				if (isCurrentRequest()) callbacks.onDelta(delta);
			} else if (event.type === 'assistant.message') {
				lastActivityMs = Date.now();
				lastAssistantMessageContent = event.data.content || lastAssistantMessageContent;
			} else if (event.type === 'session.idle') {
				lastActivityMs = Date.now();
				emitDone();
				resolveIdle?.();
			} else if (event.type === 'session.error') {
				lastActivityMs = Date.now();
				sawSessionError = true;
				const error = new Error(event.data.message);
				if (isCurrentRequest()) callbacks.onError(error);
				rejectIdle?.(error);
			} else if (event.type === 'tool.execution_start') {
				lastActivityMs = Date.now();
				const timestampMs = Date.now();
				const args = (event.data.arguments ?? {}) as Record<string, unknown>;
				toolStartMap.set(event.data.toolCallId, {
					toolName: event.data.toolName,
					args,
					startedAtMs: timestampMs,
				});
				if (callbacks.onToolUse && isCurrentRequest()) {
					callbacks.onToolUse({
						toolCallId: event.data.toolCallId,
						toolName: event.data.toolName,
						args,
						timestampMs,
					});
				}
			} else if (event.type === 'tool.execution_complete') {
				lastActivityMs = Date.now();
				const started = toolStartMap.get(event.data.toolCallId);
				toolStartMap.delete(event.data.toolCallId);
				const resultContent = getToolResultContent(event.data.result);
				if (callbacks.onToolComplete && isCurrentRequest()) {
					callbacks.onToolComplete({
						toolCallId: event.data.toolCallId,
						toolName: started?.toolName ?? 'unknown_tool',
						success: event.data.success,
						durationMs: started ? Math.max(0, Date.now() - started.startedAtMs) : null,
						args: started?.args ?? {},
						resultContent: resultContent || undefined,
						resultSummary: resultContent ? summarizeToolOutput(resultContent, 200) : undefined,
					});
				}
			}
		});
		this.unsubscribeSession = unsub;

		await session.send({
			prompt,
			attachments: buildAttachments(noteContexts),
		});

		let timeoutId: ReturnType<typeof setTimeout> | null = null;
		const idleTimeoutPromise = new Promise<void>((resolve) => {
			const scheduleInactivityTimeout = () => {
				const quietMs = Date.now() - lastActivityMs;
				const waitMs = Math.max(1000, STREAM_IDLE_TIMEOUT_MS - quietMs);
				timeoutId = setTimeout(() => {
					const idleForMs = Date.now() - lastActivityMs;
					if (idleForMs >= STREAM_IDLE_TIMEOUT_MS) {
						emitDone();
						resolve();
						return;
					}
					scheduleInactivityTimeout();
				}, waitMs);
			};
			scheduleInactivityTimeout();
		});
		try {
			await Promise.race([idlePromise, idleTimeoutPromise]);
		} finally {
			if (timeoutId) clearTimeout(timeoutId);
		}
	}

	async abort(): Promise<void> {
		if (this.session) {
			try { await this.session.abort(); } catch { /* ignore */ }
		}
	}

	// M0 modal compat — single-shot ask with immediate abort handle
	ask(
		prompt: string,
		noteContext: NoteContext | null,
		settings: VilotSettings,
	): { promise: Promise<string>; abort: () => void } {
		let sessionRef: CopilotSession | null = null;
		const abort = () => {
			if (sessionRef) sessionRef.destroy().catch(() => {});
		};

		const promise = (async () => {
			await this.start();
			if (!this.client) throw new Error('Copilot client not available');

			sessionRef = await this.client.createSession({
				model: settings.model,
				systemMessage: { content: NOTE_ACTION_SYSTEM_MESSAGE },
			});

			try {
				const response = await sessionRef.sendAndWait({
					prompt,
					attachments: noteContext ? buildAttachments([noteContext]) : [],
				}, 60000);
				return response?.data?.content ?? 'No response received.';
			} catch (err) {
				abort();
				throw err;
			} finally {
				if (sessionRef) {
					await sessionRef.destroy().catch(() => {});
					sessionRef = null;
				}
			}
		})();

		return { promise, abort };
	}
}
