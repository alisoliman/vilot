import {
	Component,
	ItemView,
	MarkdownRenderer,
	MarkdownView,
	Modal,
	Notice,
	normalizePath,
	setIcon,
	TFile,
	type WorkspaceLeaf,
} from 'obsidian';
import type { CopilotService, ToolCompleteEvent, ToolUseEvent } from '../copilot';
import { computeProposalDiff, parseEditProposalFromResult, type EditProposal } from '../composer';
import { INTERNAL_TOOL_NAMES, TOOL_DISPLAY_NAMES, VIEW_TYPE_VILOT_CHAT } from '../constants';
import type { SkillManager, SkillMatchResult } from '../skills';
import type { ChatMessage, ModelOption, NoteContext, VilotSettings } from '../types';
import { FALLBACK_MODELS } from '../types';
import { DiffModal } from './diff-modal';
import { formatError, getActiveNoteContext } from '../utils';
import {
	extractMentions,
	resolveMentions,
	getActiveMentionContext,
	buildMentionInsertValue,
	type MentionToken,
	type ActiveMentionContext,
} from './mention-resolver';
import { buildAutocompleteItems, type AutocompleteItem, type AutocompleteMode } from './autocomplete-handler';

/** Internal SDK tools that should not be shown to the user. */
const HIDDEN_TOOLS = new Set<string>(INTERNAL_TOOL_NAMES);

interface ToolGroupState {
	root: HTMLElement;
	toggle: HTMLButtonElement;
	details: HTMLElement;
	count: number;
}

interface ToolIndicatorState {
	element: HTMLElement;
	iconEl: HTMLElement;
	detailsEl: HTMLElement;
	resultEl: HTMLElement;
	timingEl: HTMLElement;
}

export class VilotChatView extends ItemView {
	private copilot: CopilotService;
	private skillManager: SkillManager;
	private settings: VilotSettings;
	private getSettings: () => VilotSettings;
	private saveSettings: () => Promise<void>;
	private messages: ChatMessage[] = [];
	private messagesEl: HTMLElement;
	private inputEl: HTMLTextAreaElement;
	private sendBtn: HTMLButtonElement;
	private cancelBtn: HTMLButtonElement;
	private contextLabelEl: HTMLElement;
	private modelSelectEl: HTMLSelectElement;
	private lastNoteContext: NoteContext | null = null;
	private isStreaming = false;
	private streamingCancelled = false;
	private savedInput = '';
	private streamingContentEl: HTMLElement | null = null;
	private streamingContent = '';
	private streamingBuffer: string[] = [];
	private streamingFlushTimer: ReturnType<typeof setInterval> | null = null;
	private streamingComponent: Component | null = null;
	private messageComponents: Component[] = [];
	private autocompleteEl: HTMLElement | null = null;
	private autocompleteMode: AutocompleteMode | null = null;
	private autocompleteItems: AutocompleteItem[] = [];
	private autocompleteIndex = -1;
	private toolCallMap = new Map<string, ToolIndicatorState>();
	private toolGroupMap = new WeakMap<HTMLElement, ToolGroupState>();

	constructor(
		leaf: WorkspaceLeaf,
		copilot: CopilotService,
		skillManager: SkillManager,
		getSettings: () => VilotSettings,
		saveSettings: () => Promise<void>,
	) {
		super(leaf);
		this.copilot = copilot;
		this.skillManager = skillManager;
		this.getSettings = getSettings;
		this.saveSettings = saveSettings;
		this.settings = getSettings();
	}

	getViewType(): string {
		return VIEW_TYPE_VILOT_CHAT;
	}

	getDisplayText(): string {
		return 'Vilot chat';
	}

	getIcon(): string {
		return 'message-circle';
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass('vilot-chat-container');

		// Header
		const header = container.createDiv({ cls: 'vilot-chat-header' });
		this.contextLabelEl = header.createDiv({ cls: 'vilot-chat-context' });
		this.updateContextLabel();

		const headerActions = header.createDiv({ cls: 'vilot-chat-header-actions' });

		// Model selector in header
		this.modelSelectEl = headerActions.createEl('select', {
			cls: 'vilot-model-select',
			attr: { 'aria-label': 'Select model' },
		});
		this.populateModelSelect();

			const historyBtn = headerActions.createEl('button', {
				cls: 'vilot-header-btn clickable-icon',
				attr: { 'aria-label': 'Conversation history' },
			});
			setIcon(historyBtn, 'history');
			historyBtn.addEventListener('click', () => {
				void this.showHistory();
			});

			const newChatBtn = headerActions.createEl('button', {
				cls: 'vilot-header-btn clickable-icon',
				attr: { 'aria-label': 'New conversation' },
			});
			setIcon(newChatBtn, 'plus');
			newChatBtn.addEventListener('click', () => {
				void this.newConversation();
			});

		// Messages area
		this.messagesEl = container.createDiv({ cls: 'vilot-chat-messages' });
		this.messagesEl.setAttribute('role', 'log');
		this.messagesEl.setAttribute('aria-label', 'Chat messages');
		this.messagesEl.setAttribute('aria-live', 'polite');

		// Restore saved chat history or show welcome
		this.restoreHistory();

		// Input area
		const inputArea = container.createDiv({ cls: 'vilot-chat-input-area' });
		this.inputEl = inputArea.createEl('textarea', {
			attr: {
				placeholder: 'Ask Vilot anything... (Shift+Enter for new line)',
				rows: '3',
				'aria-label': 'Chat message input',
			},
			cls: 'vilot-chat-input',
		});

			this.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
				if (this.handleAutocompleteKeydown(e)) return;
				if (e.key === 'Enter' && !e.shiftKey) {
					e.preventDefault();
					void this.handleSend();
				}
			});

		this.inputEl.addEventListener('input', () => {
			this.handleInputForAutocomplete();
		});

		const btnRow = inputArea.createDiv({ cls: 'vilot-chat-btn-row' });
			this.cancelBtn = btnRow.createEl('button', {
				text: 'Cancel',
				cls: 'vilot-chat-cancel-btn vilot-hidden',
			});
			this.cancelBtn.addEventListener('click', () => {
				void this.handleCancel();
			});

			this.sendBtn = btnRow.createEl('button', { text: 'Send', cls: 'vilot-chat-send-btn mod-cta' });
			this.sendBtn.addEventListener('click', () => {
				void this.handleSend();
			});

		// Track active note changes
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => this.updateContextLabel()),
		);
	}

	async onClose(): Promise<void> {
		this.stopStreaming();
		if (this.isStreaming) {
			await this.copilot.abort();
		}
		if (this.streamingComponent) {
			this.streamingComponent.unload();
			this.streamingComponent = null;
		}
		for (const comp of this.messageComponents) {
			comp.unload();
		}
		this.messageComponents = [];
		this.hideAutocomplete();
		this.toolCallMap.clear();
	}

	/** Stop the streaming flush timer and clear the buffer. */
	private stopStreaming(): void {
		if (this.streamingFlushTimer) {
			clearInterval(this.streamingFlushTimer);
			this.streamingFlushTimer = null;
		}
		this.streamingBuffer = [];
	}

	private showWelcome(): void {
		const welcome = this.messagesEl.createDiv({ cls: 'vilot-chat-welcome' });
		welcome.createEl('h3', { text: 'Vilot' });
		welcome.createEl('p', {
			text: 'Ask anything about your notes. The active note is automatically included as context.',
		});
	}

	private restoreHistory(): void {
		const saved = this.settings.chatHistory ?? [];
		if (saved.length === 0) {
			this.showWelcome();
			return;
		}
		this.messages = [...saved];
		for (const msg of this.messages) {
			if (msg.role === 'user') {
				this.renderUserMessage(msg);
			} else {
				const wrapper = this.messagesEl.createDiv({ cls: 'vilot-chat-msg vilot-chat-msg-assistant' });
				wrapper.createDiv({ cls: 'vilot-chat-msg-role', text: 'Vilot' });
				wrapper.createDiv({ cls: 'vilot-tool-use-list' });
				wrapper.createDiv({ cls: 'vilot-chat-msg-content' });
				this.finalizeAssistantMessage(wrapper, msg.content);
			}
		}
		this.scrollToBottom();
	}

	private async persistHistory(): Promise<void> {
		// Keep last 50 messages, and cap total size to ~500KB to prevent bloat
		const MAX_MESSAGES = 50;
		const MAX_TOTAL_CHARS = 500_000;
		let history = this.messages.slice(-MAX_MESSAGES);
		let totalChars = history.reduce((sum, m) => sum + m.content.length, 0);
		while (history.length > 1 && totalChars > MAX_TOTAL_CHARS) {
			const removed = history.shift();
			if (removed) totalChars -= removed.content.length;
		}
		this.settings.chatHistory = history;
		await this.saveSettings();
	}

	private showInlineError(message: string): void {
		const errEl = this.messagesEl.createDiv({ cls: 'vilot-chat-error' });
		errEl.textContent = message;
	}

	private updateContextLabel(): void {
		// Only update when the active leaf is a markdown note;
		// ignore when user clicks back to the chat pane itself.
		const noteCtx = getActiveNoteContext(this.app);
		if (noteCtx) {
			this.lastNoteContext = noteCtx;
			this.contextLabelEl.textContent = `Context: ${noteCtx.title}`;
		} else if (!this.lastNoteContext) {
			this.contextLabelEl.textContent = 'No active note';
		}
	}

	private getActiveNoteCtx(): NoteContext | null {
		return getActiveNoteContext(this.app) ?? this.lastNoteContext;
	}

	private populateModelSelect(): void {
		const hidden = new Set(this.settings.hiddenModels ?? []);
		const renderOptions = (models: ModelOption[]) => {
			this.modelSelectEl.empty();
			for (const m of models) {
				if (hidden.has(m.value)) continue;
				this.modelSelectEl.createEl('option', { text: m.label, attr: { value: m.value } });
			}
			// Ensure current model is present even if hidden
			if (!this.modelSelectEl.querySelector(`option[value="${CSS.escape(this.settings.model)}"]`)) {
				this.modelSelectEl.createEl('option', { text: this.settings.model, attr: { value: this.settings.model } });
			}
			this.modelSelectEl.value = this.settings.model;
		};

		renderOptions(FALLBACK_MODELS);

			this.modelSelectEl.addEventListener('change', () => {
				void (async () => {
					this.settings.model = this.modelSelectEl.value;
					await this.saveSettings();
				})();
			});

		// Async: replace with dynamic models from API
		this.copilot.listModels().then(models => {
			if (models.length > 0) {
				renderOptions(models.map(m => ({ value: m.value, label: m.label })));
			}
		}).catch(() => {});
	}

	private extractMentions(text: string): MentionToken[] {
		return extractMentions(text);
	}

	private getActiveMentionContext(textBeforeCursor: string): ActiveMentionContext | null {
		return getActiveMentionContext(textBeforeCursor);
	}

	private buildMentionInsertValue(value: string, quoted: boolean): string {
		return buildMentionInsertValue(value, quoted);
	}

	/** Parse @mentions and resolve note, folder, and tag contexts. */
	private resolveMentions(prompt: string): {
		contexts: NoteContext[];
		resolvedMentions: Set<string>;
		mentionCount: number;
	} {
		return resolveMentions(this.app, prompt);
	}

	private buildPromptWithSkill(
		originalPrompt: string,
		skillMatch: SkillMatchResult | null,
		hasMentions: boolean,
	): string {
		if (!skillMatch) return originalPrompt;

		const userPrompt = skillMatch.cleanedPrompt.trim() || 'Run this skill for the current context.';
		const mentionScopeHint = hasMentions
			? 'The user included @mentions. Treat mentioned notes, folders, or tags as the primary context for this request.'
			: 'If no explicit @mentions are provided, default to the active note when the skill relies on note context.';
		return 'Apply these skill instructions for this request only.\n\n'
			+ `Skill: ${skillMatch.skill.name}\n`
			+ `${mentionScopeHint}\n`
			+ '---\n'
			+ `${skillMatch.skill.body}\n`
			+ '---\n\n'
			+ `User request:\n${userPrompt}`;
	}

	private async handleSend(): Promise<void> {
		const prompt = this.inputEl.value.trim();
		if (!prompt || this.isStreaming) return;

		this.settings = this.getSettings();
		const mentionResolution = this.resolveMentions(prompt);
		const skillMatch = this.skillManager.matchSkill(prompt, this.settings.disabledSkills ?? []);
		const promptForModel = this.buildPromptWithSkill(prompt, skillMatch, mentionResolution.mentionCount > 0);

		if (!this.copilot.isStarted) {
			this.showInlineError(
				'Copilot is not connected. Check that the CLI is installed and try reloading the plugin.',
			);
			return;
		}

		// Clear welcome message on first send
		if (this.messages.length === 0) {
			this.messagesEl.empty();
		}

		const noteContext = this.getActiveNoteCtx();

		const mentionedContexts = mentionResolution.contexts;

		// Combine active note + @mentioned notes (deduplicate by path)
		const allContexts: NoteContext[] = [];
		const seen = new Set<string>();
		if (noteContext) {
			allContexts.push(noteContext);
			seen.add(noteContext.absolutePath);
		}
		for (const ctx of mentionedContexts) {
			if (!seen.has(ctx.absolutePath)) {
				allContexts.push(ctx);
				seen.add(ctx.absolutePath);
			}
		}

		// Build set of resolved mention names for highlighting
		const resolvedMentions = mentionResolution.resolvedMentions;

		// Add user message
		const userMsg: ChatMessage = {
			role: 'user',
			content: prompt,
			noteTitle: noteContext?.title ?? null,
			timestamp: Date.now(),
		};
		this.messages.push(userMsg);
		this.renderUserMessage(userMsg, resolvedMentions);

		this.savedInput = prompt;
		this.inputEl.value = '';
		this.hideAutocomplete();
		this.streamingCancelled = false;
		this.setStreamingState(true);

		// Create assistant message container for streaming
		const msgWrapper = this.messagesEl.createDiv({ cls: 'vilot-chat-msg vilot-chat-msg-assistant' });
		const roleLabel = msgWrapper.createDiv({ cls: 'vilot-chat-msg-role' });
		roleLabel.textContent = 'Vilot';
		if (skillMatch) {
			roleLabel.createEl('span', {
				text: ` · ${skillMatch.skill.name}`,
				cls: 'vilot-chat-msg-context-hint',
			});
		}
		const toolsContainer = msgWrapper.createDiv({ cls: 'vilot-tool-use-list' });
		this.streamingContentEl = msgWrapper.createDiv({ cls: 'vilot-chat-msg-content' });
		this.streamingContentEl.createEl('span', { text: 'Thinking...', cls: 'vilot-loading' });
		this.streamingContent = '';
		this.streamingComponent = new Component();
		this.streamingComponent.load();
		this.scrollToBottom();
		const composerProposals: EditProposal[] = [];
		const completedTools: ToolCompleteEvent[] = [];

		try {
			let firstDelta = true;
			await this.copilot.sendStreaming(
				promptForModel,
				allContexts,
				this.settings,
				{
					onDelta: (delta: string) => {
						if (this.streamingCancelled) return;
						if (firstDelta && this.streamingContentEl) {
							this.streamingContentEl.empty();
							firstDelta = false;
						}
						this.streamingBuffer.push(delta);
						this.scheduleStreamingRender();
					},
					onDone: (fullContent: string) => {
						if (this.streamingCancelled) return;
						this.stopStreaming();
						const toolOnlyFallback = this.buildToolOnlyFallback(completedTools);
						const finalContent = fullContent.trim()
							? fullContent
							: (composerProposals.length > 0
								? 'Prepared edit proposals below.'
								: toolOnlyFallback);
						const assistantMsg: ChatMessage = {
							role: 'assistant',
							content: finalContent,
							noteTitle: noteContext?.title ?? null,
							timestamp: Date.now(),
						};
						this.messages.push(assistantMsg);
						this.finalizeAssistantMessage(msgWrapper, finalContent);
							if (composerProposals.length > 0) {
								this.renderComposerProposals(msgWrapper, composerProposals);
							}
							this.savedInput = '';
							this.setStreamingState(false);
							void this.persistHistory();
						},
					onError: (error: Error) => {
						if (this.streamingCancelled) return;
						if (this.streamingContentEl) {
							this.streamingContentEl.empty();
							this.streamingContentEl.createDiv({
								cls: 'vilot-chat-error',
								text: `Error: ${formatError(error)}`,
							});
						}
						this.inputEl.value = this.savedInput;
						this.setStreamingState(false);
					},
					onToolUse: (event: ToolUseEvent) => {
						if (this.streamingCancelled) return;
						if (HIDDEN_TOOLS.has(event.toolName)) return;
						this.renderToolUseIndicator(toolsContainer, event, event.toolCallId);
						this.scrollToBottom();
					},
					onToolComplete: (event: ToolCompleteEvent) => {
						if (this.streamingCancelled) return;
						completedTools.push(event);
						const proposal = this.handleToolComplete(event);
						if (proposal) {
							composerProposals.push(proposal);
						}
					},
				},
			);
		} catch (err) {
			if (!this.streamingCancelled) {
				if (this.streamingContentEl) {
					this.streamingContentEl.empty();
					this.streamingContentEl.createDiv({
						cls: 'vilot-chat-error',
						text: `Error: ${formatError(err)}`,
					});
				}
				this.inputEl.value = this.savedInput;
			}
			this.setStreamingState(false);
		}
	}

	private scheduleStreamingRender(): void {
		if (this.streamingFlushTimer) return;
		this.streamingFlushTimer = setInterval(() => {
			if (!this.streamingContentEl || this.streamingBuffer.length === 0) {
				this.stopStreaming();
				return;
			}
			const chunk = this.streamingBuffer.splice(0, 3).join('');
			this.streamingContent += chunk;
			this.streamingContentEl.textContent = this.streamingContent;
			this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
		}, 30);
	}

	private finalizeAssistantMessage(wrapper: HTMLElement, content: string): void {
		// Clean up streaming component
		if (this.streamingComponent) {
			this.streamingComponent.unload();
			this.streamingComponent = null;
		}

		// Re-render with final content
		const contentEl = wrapper.querySelector('.vilot-chat-msg-content');
		if (contentEl) {
			contentEl.empty();
			const comp = new Component();
			comp.load();
			this.messageComponents.push(comp);
			MarkdownRenderer.render(
				this.app,
				content,
				contentEl as HTMLElement,
				'',
				comp,
			).then(() => {
				this.cleanupRenderedContent(contentEl as HTMLElement);
				this.addApplyButtonsToCodeBlocks(contentEl as HTMLElement);
			}).catch(() => {
				(contentEl as HTMLElement).textContent = content;
			});

			// Obsidian may inject copy buttons asynchronously after render
			const observer = new MutationObserver(() => {
				this.cleanupRenderedContent(contentEl as HTMLElement);
				this.addApplyButtonsToCodeBlocks(contentEl as HTMLElement);
			});
			observer.observe(contentEl, { childList: true, subtree: true });
			// Stop observing after 2s to avoid leak
			setTimeout(() => observer.disconnect(), 2000);
		}

		// Defensive: if finalize is triggered again for the same wrapper, keep a single action row.
		wrapper.querySelectorAll('.vilot-chat-msg-actions').forEach(el => el.remove());

		// Add action buttons
		const actions = wrapper.createDiv({ cls: 'vilot-chat-msg-actions' });
		const copyBtn = actions.createEl('button', {
			cls: 'vilot-chat-action-btn clickable-icon',
			attr: { 'aria-label': 'Copy response' },
		});
		setIcon(copyBtn, 'copy');
		copyBtn.addEventListener('click', () => {
			navigator.clipboard.writeText(content)
				.then(() => new Notice('Copied to clipboard'))
				.catch(() => new Notice('Failed to copy'));
		});

		this.streamingContentEl = null;
		this.streamingContent = '';
		this.scrollToBottom();
	}

	private renderUserMessage(msg: ChatMessage, resolvedMentions?: Set<string>): void {
		const wrapper = this.messagesEl.createDiv({ cls: 'vilot-chat-msg vilot-chat-msg-user' });
		const roleLabel = wrapper.createDiv({ cls: 'vilot-chat-msg-role' });
		roleLabel.textContent = 'You';
		if (msg.noteTitle) {
			roleLabel.createEl('span', {
				text: ` · ${msg.noteTitle}`,
				cls: 'vilot-chat-msg-context-hint',
			});
		}
		const contentEl = wrapper.createDiv({ cls: 'vilot-chat-msg-content' });
		this.renderTextWithMentions(contentEl, msg.content, resolvedMentions);
		this.scrollToBottom();
	}

	/** Remove Obsidian-injected UI elements from rendered markdown and linkify note paths. */
	private cleanupRenderedContent(el: HTMLElement): void {
		el.querySelectorAll('.copy-code-button, .code-block-flair, button.copy-code').forEach(btn => btn.remove());
		this.linkifyNotePaths(el);
	}

	private renderComposerProposals(wrapper: HTMLElement, proposals: EditProposal[]): void {
		if (proposals.length === 0) return;

		const section = wrapper.createDiv({ cls: 'vilot-composer-section' });
		section.createDiv({ cls: 'vilot-composer-title', text: 'Proposed edits' });

		const cards: Array<{
			proposal: EditProposal;
			card: HTMLElement;
			acceptBtn: HTMLButtonElement;
			rejectBtn: HTMLButtonElement;
			statusEl: HTMLElement;
		}> = [];

		for (const proposal of proposals) {
			const card = section.createDiv({ cls: 'vilot-composer-card' });
			const header = card.createDiv({ cls: 'vilot-composer-header' });
				const pathBtn = header.createEl('button', { text: proposal.path, cls: 'vilot-composer-path' });
				pathBtn.addEventListener('click', (e) => {
					e.preventDefault();
					void this.app.workspace.openLinkText(proposal.path, '');
				});
			header.createEl('span', { text: proposal.description, cls: 'vilot-composer-description' });

			const diffEl = card.createDiv({ cls: 'vilot-composer-diff' });
			const diffLines = computeProposalDiff(proposal.originalContent, proposal.proposedContent);
			const maxLines = 400;
			for (const line of diffLines.slice(0, maxLines)) {
				const lineEl = diffEl.createDiv({ cls: `vilot-composer-line vilot-composer-line-${line.type}` });
				lineEl.createEl('span', {
					cls: 'vilot-composer-marker',
					text: line.type === 'added' ? '+' : line.type === 'removed' ? '−' : ' ',
				});
				lineEl.createEl('span', { cls: 'vilot-composer-text', text: line.text || ' ' });
			}
			if (diffLines.length > maxLines) {
				diffEl.createDiv({
					cls: 'vilot-composer-truncated',
					text: `Diff truncated (${maxLines} of ${diffLines.length} lines shown)`,
				});
			}

			const actionRow = card.createDiv({ cls: 'vilot-composer-actions' });
			const statusEl = actionRow.createDiv({ cls: 'vilot-composer-status', text: 'Pending' });
			const rejectBtn = actionRow.createEl('button', { text: 'Reject', cls: 'vilot-diff-reject-btn' });
			const acceptBtn = actionRow.createEl('button', { text: 'Accept', cls: 'vilot-diff-accept-btn mod-cta' });

			rejectBtn.addEventListener('click', () => {
				proposal.status = 'rejected';
				this.updateProposalCardState(card, acceptBtn, rejectBtn, statusEl, proposal.status);
			});

			acceptBtn.addEventListener('click', () => {
				this.applyProposalToVault(proposal, card, acceptBtn, rejectBtn, statusEl).catch((err) => {
					new Notice(`Failed to apply proposal: ${err instanceof Error ? err.message : String(err)}`);
				});
			});

			cards.push({ proposal, card, acceptBtn, rejectBtn, statusEl });
		}

		if (proposals.length > 1) {
			const footer = section.createDiv({ cls: 'vilot-composer-footer' });
			const rejectAll = footer.createEl('button', { text: 'Reject all', cls: 'vilot-diff-reject-btn' });
			const acceptAll = footer.createEl('button', { text: 'Accept all', cls: 'vilot-diff-accept-btn mod-cta' });

			rejectAll.addEventListener('click', () => {
				for (const entry of cards) {
					if (entry.proposal.status !== 'pending') continue;
					entry.proposal.status = 'rejected';
					this.updateProposalCardState(entry.card, entry.acceptBtn, entry.rejectBtn, entry.statusEl, 'rejected');
				}
			});

			acceptAll.addEventListener('click', () => {
				this.applyAllProposals(cards).catch((err) => {
					new Notice(`Failed to apply all proposals: ${err instanceof Error ? err.message : String(err)}`);
				});
			});
		}
	}

	private async applyAllProposals(cards: Array<{
		proposal: EditProposal;
		card: HTMLElement;
		acceptBtn: HTMLButtonElement;
		rejectBtn: HTMLButtonElement;
		statusEl: HTMLElement;
	}>): Promise<void> {
		let applied = 0;
		for (const entry of cards) {
			if (entry.proposal.status !== 'pending') continue;
			const ok = await this.applyProposalToVault(
				entry.proposal,
				entry.card,
				entry.acceptBtn,
				entry.rejectBtn,
				entry.statusEl,
			);
			if (ok) applied++;
		}
		if (applied > 0) {
			new Notice(`Applied ${applied} proposal${applied === 1 ? '' : 's'}.`);
		}
	}

	private async applyProposalToVault(
		proposal: EditProposal,
		card: HTMLElement,
		acceptBtn: HTMLButtonElement,
		rejectBtn: HTMLButtonElement,
		statusEl: HTMLElement,
	): Promise<boolean> {
		const abstractFile = this.app.vault.getAbstractFileByPath(proposal.path);
		if (!(abstractFile instanceof TFile)) {
			new Notice(`File not found: ${proposal.path}`);
			return false;
		}

		const current = await this.app.vault.read(abstractFile);
		if (current !== proposal.originalContent) {
			new Notice(`Skipped ${proposal.path}: file changed since proposal was created.`);
			return false;
		}

		await this.app.vault.modify(abstractFile, proposal.proposedContent);
		proposal.status = 'accepted';
		this.updateProposalCardState(card, acceptBtn, rejectBtn, statusEl, 'accepted');
		return true;
	}

	private updateProposalCardState(
		card: HTMLElement,
		acceptBtn: HTMLButtonElement,
		rejectBtn: HTMLButtonElement,
		statusEl: HTMLElement,
		status: EditProposal['status'],
	): void {
		card.removeClass('is-accepted', 'is-rejected');
		if (status === 'accepted') {
			card.addClass('is-accepted');
			statusEl.textContent = 'Accepted';
		} else if (status === 'rejected') {
			card.addClass('is-rejected');
			statusEl.textContent = 'Rejected';
		} else {
			statusEl.textContent = 'Pending';
		}
		const done = status !== 'pending';
		acceptBtn.disabled = done;
		rejectBtn.disabled = done;
	}

	private addApplyButtonsToCodeBlocks(contentEl: HTMLElement): void {
		const codeBlocks = contentEl.querySelectorAll('pre');
		for (const pre of Array.from(codeBlocks)) {
			if (!(pre instanceof HTMLElement)) continue;
			if (pre.dataset.vilotApplyBound === 'true') continue;
			const codeText = pre.querySelector('code')?.textContent ?? pre.textContent ?? '';
			if (!this.isLikelyNoteContent(codeText)) continue;

			pre.dataset.vilotApplyBound = 'true';
			const action = document.createElement('button');
			action.className = 'vilot-code-apply-btn';
			action.textContent = 'Apply to note';
			action.addEventListener('click', () => {
				this.applyCodeBlockToActiveNote(codeText).catch((err) => {
					new Notice(`Could not apply content: ${err instanceof Error ? err.message : String(err)}`);
				});
			});
			pre.parentElement?.insertBefore(action, pre);
		}
	}

	private isLikelyNoteContent(text: string): boolean {
		const trimmed = text.trim();
		if (!trimmed) return false;
		const lines = trimmed.split('\n');
		if (lines.length < 3) return false;
		return trimmed.includes('#')
			|| trimmed.includes('- ')
			|| trimmed.includes('## ')
			|| trimmed.length > 120;
	}

	private async applyCodeBlockToActiveNote(newContent: string): Promise<void> {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view?.file) {
			new Notice('Open a note first to apply generated content.');
			return;
		}
		const file = view.file;
		const oldContent = await this.app.vault.read(file);
		new DiffModal(this.app, file, oldContent, newContent, 'Apply generated content').open();
	}

	/** Render text with @mentions highlighted. Resolved mentions get accent color, unresolved stay plain. */
	private renderTextWithMentions(el: HTMLElement, text: string, resolved?: Set<string>): void {
		if (!resolved || resolved.size === 0) {
			el.textContent = text;
			return;
		}
		const mentions = this.extractMentions(text);
		if (mentions.length === 0) {
			el.textContent = text;
			return;
		}

		let cursor = 0;
		for (const mention of mentions) {
			if (mention.start > cursor) {
				el.appendText(text.slice(cursor, mention.start));
			}
			const raw = text.slice(mention.start, mention.end);
			if (resolved.has(raw.toLowerCase())) {
				el.createEl('span', { text: raw, cls: 'vilot-mention' });
			} else {
				el.appendText(raw);
			}
			cursor = mention.end;
		}
		if (cursor < text.length) {
			el.appendText(text.slice(cursor));
		}
	}

	/** Walk text nodes and convert vault file paths (ending in .md) into clickable links. */
	private linkifyNotePaths(el: HTMLElement): void {
		const codeEls = el.querySelectorAll('code, strong');
		for (const codeEl of Array.from(codeEls)) {
			const text = codeEl.textContent ?? '';
			if (!text.endsWith('.md')) continue;
			const file = this.app.vault.getAbstractFileByPath(text);
			if (!file) continue;
				const link = document.createElement('a');
				link.textContent = text;
				link.className = 'vilot-note-link';
				link.addEventListener('click', (e) => {
					e.preventDefault();
					void this.app.workspace.openLinkText(text, '');
				});
				codeEl.replaceWith(link);
			}
	}

	private async handleCancel(): Promise<void> {
		this.streamingCancelled = true;
		await this.copilot.abort();
		if (this.streamingContentEl && this.streamingContent) {
			// Keep partial content
			const assistantMsg: ChatMessage = {
				role: 'assistant',
				content: this.streamingContent + '\n\n*[Response cancelled]*',
				noteTitle: null,
				timestamp: Date.now(),
			};
			this.messages.push(assistantMsg);
			const wrapper = this.streamingContentEl.parentElement;
			if (wrapper) {
				this.finalizeAssistantMessage(wrapper, assistantMsg.content);
			}
			}
			this.setStreamingState(false);
			await this.persistHistory();
		}

	private setStreamingState(streaming: boolean): void {
		this.isStreaming = streaming;
		this.sendBtn.disabled = streaming;
		this.sendBtn.textContent = streaming ? 'Sending...' : 'Send';
		this.cancelBtn.toggleClass('vilot-hidden', !streaming);
		this.inputEl.disabled = streaming;
		if (!streaming) this.inputEl.focus();
	}

	private async newConversation(): Promise<void> {
		if (this.messages.length > 0 && !await this.confirmNewChat()) return;
		if (this.isStreaming) await this.handleCancel();

		// Save old conversation to vault before clearing
		if (this.messages.length > 0) {
			await this.saveConversationToVault();
		}

		await this.copilot.resetSession();
		this.messages = [];
		this.settings.chatHistory = [];
		await this.saveSettings();
		this.toolCallMap.clear();
		for (const comp of this.messageComponents) comp.unload();
		this.messageComponents = [];
		if (this.streamingComponent) {
			this.streamingComponent.unload();
			this.streamingComponent = null;
		}
		this.messagesEl.empty();
		this.showWelcome();
	}

	/** Save the current conversation as a markdown note in the conversations folder. */
	private async saveConversationToVault(): Promise<void> {
		const folder = this.settings.conversationsFolder || 'Vilot/Conversations';
		const folderPath = normalizePath(folder);

		// Ensure folder exists
		const segments = folderPath.split('/');
		let current = '';
		for (const seg of segments) {
			current = current ? `${current}/${seg}` : seg;
			if (!this.app.vault.getAbstractFileByPath(current)) {
				await this.app.vault.createFolder(current);
			}
		}

			// Generate filename from timestamp + first user message
			const firstMsg = this.messages.find(m => m.role === 'user');
			const snippet = firstMsg
				? firstMsg.content.slice(0, 40).replace(/[[\\/:*?"<>|#^\]]/g, '').trim()
				: 'conversation';
		const ts = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '-');
		const filePath = normalizePath(`${folderPath}/${ts} ${snippet}.md`);

		// Build markdown
		const lines: string[] = ['---', `date: ${new Date().toISOString()}`, `model: ${this.settings.model}`, '---', ''];
		for (const msg of this.messages) {
			const role = msg.role === 'user' ? '**You**' : '**Vilot**';
			lines.push(`### ${role}`, '', msg.content, '');
		}

		try {
			await this.app.vault.create(filePath, lines.join('\n'));
			new Notice(`Conversation saved to ${filePath}`);
		} catch {
			// File may already exist; silently skip
		}
	}

	private confirmNewChat(): Promise<boolean> {
		return new Promise<boolean>(resolve => {
			const modal = new (class extends Modal {
				onOpen() {
					this.contentEl.createEl('h3', { text: 'Start new conversation?' });
					this.contentEl.createEl('p', {
						text: 'The current conversation will be saved to your vault.',
					});
					const btnRow = this.contentEl.createDiv({ cls: 'vilot-diff-btn-row' });
					btnRow.createEl('button', {
						text: 'Keep chatting',
						cls: 'vilot-diff-reject-btn',
					}).addEventListener('click', () => { resolve(false); this.close(); });
					btnRow.createEl('button', {
						text: 'New conversation',
						cls: 'mod-cta',
					}).addEventListener('click', () => { resolve(true); this.close(); });
				}
				onClose() { resolve(false); }
			})(this.app);
			modal.open();
		});
	}

	/** Show a modal with saved conversations to load. */
	private async showHistory(): Promise<void> {
		const folder = this.settings.conversationsFolder || 'Vilot/Conversations';
		const folderPath = normalizePath(folder);
		const allFiles = this.app.vault.getMarkdownFiles()
			.filter(f => f.path.startsWith(folderPath + '/'))
			.sort((a, b) => b.stat.mtime - a.stat.mtime);

		if (allFiles.length === 0) {
			new Notice('No saved conversations found.');
			return;
		}

			const loadConversation = (file: TFile) => {
				void this.loadConversationFromFile(file);
			};
			const modal = new (class extends Modal {
				onOpen() {
					this.contentEl.createEl('h3', { text: 'Conversation history' });
					const searchInput = this.contentEl.createEl('input', {
						cls: 'vilot-history-search',
						attr: { type: 'text', placeholder: 'Filter conversations...', 'aria-label': 'Filter conversations' },
					});
					const list = this.contentEl.createDiv({ cls: 'vilot-history-list' });
					const renderList = (filter: string) => {
						list.empty();
						const query = filter.toLowerCase().trim();
						const filtered = query
							? allFiles.filter(f => f.basename.toLowerCase().includes(query))
							: allFiles;
						for (const file of filtered.slice(0, 30)) {
							const item = list.createDiv({ cls: 'vilot-history-item' });
							item.createEl('span', { text: file.basename, cls: 'vilot-history-name' });
							const date = new Date(file.stat.mtime);
							item.createEl('span', {
								text: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
								cls: 'vilot-history-date',
							});
							item.addEventListener('click', () => {
								loadConversation(file);
								this.close();
							});
						}
						if (filtered.length === 0) {
							list.createDiv({ cls: 'vilot-history-empty', text: 'No matching conversations.' });
						}
					};
					renderList('');
					searchInput.addEventListener('input', () => renderList(searchInput.value));
					searchInput.focus();
				}
				onClose() { this.contentEl.empty(); }
		})(this.app);
		modal.open();
	}

	/** Parse a saved conversation markdown file and load it into the chat. */
	private async loadConversationFromFile(file: TFile): Promise<void> {
		const content = await this.app.vault.read(file);

		// Parse the markdown format: ### **You** / ### **Vilot** sections
		const messages: ChatMessage[] = [];
		const sections = content.split(/^### /m).filter(s => s.trim());

		for (const section of sections) {
			if (section.startsWith('---')) continue; // skip frontmatter
			let role: 'user' | 'assistant' | null = null;
			if (section.startsWith('**You**')) role = 'user';
			else if (section.startsWith('**Vilot**')) role = 'assistant';
			if (!role) continue;

			const body = section.replace(/^\*\*(You|Vilot)\*\*\s*\n?/, '').trim();
			if (body) {
				messages.push({ role, content: body, noteTitle: null, timestamp: file.stat.mtime });
			}
		}

		if (messages.length === 0) {
			new Notice('Could not parse conversation from file.');
			return;
		}

		// Clear current chat and load
		await this.copilot.resetSession();
		this.messages = [];
		this.toolCallMap.clear();
		for (const comp of this.messageComponents) comp.unload();
		this.messageComponents = [];
		this.messagesEl.empty();

		// Render all messages
		this.messages = messages;
		for (const msg of messages) {
			if (msg.role === 'user') {
				this.renderUserMessage(msg);
			} else {
				const wrapper = this.messagesEl.createDiv({ cls: 'vilot-chat-msg vilot-chat-msg-assistant' });
				wrapper.createDiv({ cls: 'vilot-chat-msg-role', text: 'Vilot' });
				wrapper.createDiv({ cls: 'vilot-tool-use-list' });
				wrapper.createDiv({ cls: 'vilot-chat-msg-content' });
				this.finalizeAssistantMessage(wrapper, msg.content);
			}
		}
		this.scrollToBottom();
		await this.persistHistory();
		new Notice(`Loaded: ${file.basename}`);
	}

	private scrollToBottom(): void {
		requestAnimationFrame(() => {
			this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
		});
	}

	/** Focus input and set placeholder for vault-wide questions */
	primeForVault(): void {
		this.inputEl.placeholder = 'Ask about your vault... (e.g. "what are my open tasks?")';
		this.inputEl.focus();
	}

	/** Add aria attrs to tool use toggle */
	private renderToolUseIndicator(container: HTMLElement, event: ToolUseEvent, toolCallId?: string): void {
		const group = this.ensureToolGroup(container);
		group.count++;
		group.toggle.setText(`Used ${group.count} tool${group.count === 1 ? '' : 's'}`);

		const indicator = group.details.createDiv({ cls: 'vilot-tool-use vilot-tool-running' });
		const toggle = indicator.createEl('button', {
			cls: 'vilot-tool-use-toggle clickable-icon',
			attr: { 'aria-expanded': 'false', 'aria-label': `Tool: ${event.toolName}` },
		});
		const iconSpan = toggle.createEl('span', { cls: 'vilot-tool-icon' });
		setIcon(iconSpan, 'loader');
		iconSpan.addClass('vilot-tool-running');
		const label = TOOL_DISPLAY_NAMES[event.toolName] ?? event.toolName;
		const argSummary = this.formatToolArgs(event);
		toggle.appendText(` ${label}${argSummary ? ': ' + argSummary : ''}`);

		const details = indicator.createDiv({ cls: 'vilot-tool-use-details' });
		details.toggleClass('vilot-hidden', true);
		details.createDiv({
			text: JSON.stringify(event.args, null, 2),
			cls: 'vilot-tool-use-args',
		});
		const timing = details.createDiv({ cls: 'vilot-tool-use-meta', text: 'Running...' });
		const result = details.createDiv({ cls: 'vilot-tool-use-result', text: 'Waiting for result...' });

		if (toolCallId) {
			this.toolCallMap.set(toolCallId, {
				element: indicator,
				iconEl: iconSpan,
				detailsEl: details,
				resultEl: result,
				timingEl: timing,
			});
		}

		toggle.addEventListener('click', () => {
			const isHidden = details.hasClass('vilot-hidden');
			details.toggleClass('vilot-hidden', !isHidden);
			toggle.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
		});
	}

	private ensureToolGroup(container: HTMLElement): ToolGroupState {
		const existing = this.toolGroupMap.get(container);
		if (existing) return existing;

		const root = container.createDiv({ cls: 'vilot-tool-group' });
		const toggle = root.createEl('button', {
			cls: 'vilot-tool-group-toggle clickable-icon',
			attr: { 'aria-expanded': 'false', 'aria-label': 'Tool call group' },
		});
		const icon = toggle.createEl('span', { cls: 'vilot-tool-group-icon' });
		setIcon(icon, 'workflow');
		toggle.appendText(' Used 0 tools');

		const details = root.createDiv({ cls: 'vilot-tool-group-details vilot-hidden' });
		toggle.addEventListener('click', () => {
			const hidden = details.hasClass('vilot-hidden');
			details.toggleClass('vilot-hidden', !hidden);
			toggle.setAttribute('aria-expanded', hidden ? 'true' : 'false');
		});

		const state: ToolGroupState = {
			root,
			toggle,
			details,
			count: 0,
		};
		this.toolGroupMap.set(container, state);
		return state;
	}

	private formatToolArgs(event: ToolUseEvent): string {
		const { toolName, args } = event;

		if (toolName === 'search_vault' && typeof args['query'] === 'string') {
			return `"${args['query']}"`;
		}

		const pathArg = args['path'];
		if (typeof pathArg === 'string' && ['read_note', 'get_note_metadata', 'get_backlinks', 'create_note', 'propose_edit', 'write_note'].includes(toolName)) {
			return pathArg;
		}

		if (toolName === 'list_notes') {
			return [args['folder'], args['tag']].filter(v => typeof v === 'string').join(', ');
		}

		return '';
	}

	private buildToolOnlyFallback(events: ToolCompleteEvent[]): string {
		const visible = events.filter(event => !HIDDEN_TOOLS.has(event.toolName));
		if (visible.length === 0) {
			return 'No textual response was returned. Expand tool details above for execution results.';
		}

		const MAX_ITEMS = 6;
		const lines: string[] = [
			'I completed tool calls but did not receive a final text response from the model.',
			'',
			`Tool summary (${visible.length}):`,
		];

		for (const event of visible.slice(0, MAX_ITEMS)) {
			const label = TOOL_DISPLAY_NAMES[event.toolName] ?? event.toolName;
			const status = event.success ? 'ok' : 'failed';
			const summary = event.resultSummary
				? ` — ${event.resultSummary.slice(0, 120)}${event.resultSummary.length > 120 ? '...' : ''}`
				: '';
			lines.push(`- ${label} [${status}]${summary}`);
		}

		if (visible.length > MAX_ITEMS) {
			lines.push(`- ...and ${visible.length - MAX_ITEMS} more tool calls`);
		}

		lines.push('');
		lines.push('If you want, ask me to continue and I will synthesize these tool results.');
		return lines.join('\n');
	}

	/** Get the last assistant response content for insert-at-cursor */
	getLastAssistantResponse(): string {
		for (let i = this.messages.length - 1; i >= 0; i--) {
			if (this.messages[i]!.role === 'assistant') {
				return this.messages[i]!.content;
			}
		}
		return '';
	}

	private handleToolComplete(event: ToolCompleteEvent): EditProposal | null {
		const indicator = this.toolCallMap.get(event.toolCallId);
		if (!indicator) return null;

		indicator.element.removeClass('vilot-tool-running');
		indicator.iconEl.removeClass('vilot-tool-running');
		indicator.element.addClass(event.success ? 'vilot-tool-complete-success' : 'vilot-tool-complete-failure');
		setIcon(indicator.iconEl, event.success ? 'check' : 'x');
		indicator.timingEl.setText(
			event.durationMs !== null ? `Completed in ${event.durationMs} ms` : 'Completed',
		);
		indicator.resultEl.setText(
			event.resultSummary ? `Result: ${event.resultSummary}` : 'Result: (no textual output)',
		);
		this.toolCallMap.delete(event.toolCallId);

		if (event.toolName === 'propose_edit' && event.success && event.resultContent) {
			return parseEditProposalFromResult(event.resultContent);
		}
		return null;
	}

	// --- @mentions and /slash commands ---

	private handleInputForAutocomplete(): void {
		this.settings = this.getSettings();
		const value = this.inputEl.value;
		const cursorPos = this.inputEl.selectionStart;
		const textBeforeCursor = value.slice(0, cursorPos);
		const { state } = buildAutocompleteItems(
			this.app,
			textBeforeCursor,
			this.skillManager,
			this.settings.disabledSkills ?? [],
		);
		if (!state.mode || state.items.length === 0) {
			this.hideAutocomplete();
			return;
		}
		this.autocompleteMode = state.mode;
		this.autocompleteItems = state.items;
		this.autocompleteIndex = state.index;
		this.showAutocomplete();
	}

	private showAutocomplete(): void {
		if (!this.autocompleteEl) {
			this.autocompleteEl = this.inputEl.parentElement!.createDiv({ cls: 'vilot-autocomplete' });
		}
		this.autocompleteEl.empty();
		this.autocompleteEl.removeClass('vilot-hidden');

		for (let i = 0; i < this.autocompleteItems.length; i++) {
			const itemData = this.autocompleteItems[i]!;
			const item = this.autocompleteEl.createDiv({
				cls: `vilot-autocomplete-item${i === this.autocompleteIndex ? ' is-selected' : ''}`,
			});
			const withIcon = itemData.icon ? `${itemData.icon} ${itemData.value}` : itemData.value;
			item.textContent = itemData.description ? `${withIcon} — ${itemData.description}` : withIcon;
			const idx = i;
			item.addEventListener('mousedown', (e) => {
				e.preventDefault();
				this.acceptAutocomplete(idx);
			});
			if (i === this.autocompleteIndex) {
				requestAnimationFrame(() => item.scrollIntoView({ block: 'nearest' }));
			}
		}
	}

	private hideAutocomplete(): void {
		if (this.autocompleteEl) {
			this.autocompleteEl.addClass('vilot-hidden');
		}
		this.autocompleteMode = null;
		this.autocompleteItems = [];
		this.autocompleteIndex = -1;
	}

	private acceptAutocomplete(index: number): void {
		const selected = this.autocompleteItems[index];
		if (!selected) return;

		const value = this.inputEl.value;
		const cursorPos = this.inputEl.selectionStart;
		const textBeforeCursor = value.slice(0, cursorPos);

		if (selected.type === 'mention') {
			const mentionContext = this.getActiveMentionContext(textBeforeCursor);
			if (!mentionContext) return;
			const startPos = mentionContext.start;
			const replacement = selected.insertValue ?? this.buildMentionInsertValue(selected.value, mentionContext.quoted);
			this.inputEl.value = value.slice(0, startPos) + replacement + value.slice(cursorPos);
			const nextPos = startPos + replacement.length;
			this.inputEl.setSelectionRange(nextPos, nextPos);
		} else {
			const slashMatch = textBeforeCursor.match(/(?:^|\s)(\/[^\s/]*)$/);
			if (!slashMatch) return;
			const token = slashMatch[1]!;
			const startPos = cursorPos - token.length;
			const withoutToken = (value.slice(0, startPos) + value.slice(cursorPos)).trim();
			this.inputEl.value = withoutToken ? `${selected.value} ${withoutToken}` : `${selected.value} `;
			const nextPos = this.inputEl.value.length;
			this.inputEl.setSelectionRange(nextPos, nextPos);
		}

		this.hideAutocomplete();
		this.inputEl.focus();
	}

	private handleAutocompleteKeydown(e: KeyboardEvent): boolean {
		if (this.autocompleteItems.length === 0 || !this.autocompleteMode) return false;

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			this.autocompleteIndex = (this.autocompleteIndex + 1) % this.autocompleteItems.length;
			this.showAutocomplete();
			return true;
		}
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			this.autocompleteIndex = (this.autocompleteIndex - 1 + this.autocompleteItems.length) % this.autocompleteItems.length;
			this.showAutocomplete();
			return true;
		}
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			this.acceptAutocomplete(this.autocompleteIndex);
			return true;
		}
		if (e.key === 'Escape') {
			e.preventDefault();
			this.hideAutocomplete();
			return true;
		}
		return false;
	}
}
