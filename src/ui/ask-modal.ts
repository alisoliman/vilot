import { App, Component, MarkdownRenderer, Modal, Notice, Setting } from 'obsidian';
import type { CopilotService } from '../copilot';
import type { NoteContext, VilotSettings } from '../types';
import { formatError } from '../utils';

export class AskCopilotModal extends Modal {
	private copilot: CopilotService;
	private settings: VilotSettings;
	private noteContext: NoteContext | null;
	private inputEl: HTMLTextAreaElement;
	private responseEl: HTMLElement;
	private submitBtn: HTMLButtonElement;
	private cancelBtn: HTMLButtonElement;
	private activeAbort: (() => void) | null = null;
	private responseComponent: Component | null = null;

	constructor(
		app: App,
		copilot: CopilotService,
		settings: VilotSettings,
		noteContext: NoteContext | null,
	) {
		super(app);
		this.copilot = copilot;
		this.settings = settings;
		this.noteContext = noteContext;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass('vilot-ask-modal');

		contentEl.createEl('h2', { text: 'Vilot: ask copilot' });

		// Check if SDK is connected
		if (!this.copilot.isStarted) {
			contentEl.createEl('p', {
				text: 'Copilot is not connected. Check that the CLI is installed and try reloading the plugin.',
				cls: 'vilot-error',
			});
			return;
		}

		if (this.noteContext) {
			contentEl.createEl('p', {
				text: `Context: ${this.noteContext.title}`,
				cls: 'vilot-context-label',
			});
		}

		const inputContainer = contentEl.createDiv({ cls: 'vilot-input-container' });
		this.inputEl = inputContainer.createEl('textarea', {
			attr: { placeholder: 'Ask anything...', rows: '4', 'aria-label': 'Question input' },
			cls: 'vilot-input',
		});

		// Submit on Cmd/Ctrl+Enter
			this.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
				if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
					e.preventDefault();
					void this.submit();
				}
			});

		new Setting(contentEl)
			.addButton(btn => {
				this.submitBtn = btn.buttonEl;
				btn.setButtonText('Ask')
					.setCta()
					.onClick(() => this.submit());
			})
			.addButton(btn => {
				this.cancelBtn = btn.buttonEl;
				btn.setButtonText('Cancel')
					.onClick(() => this.cancelRequest());
				this.cancelBtn.addClass('vilot-hidden');
			});

		this.responseEl = contentEl.createDiv({ cls: 'vilot-response' });

		// Focus the input
		requestAnimationFrame(() => this.inputEl.focus());
	}

	private cancelRequest() {
		if (this.activeAbort) {
			this.activeAbort();
			this.activeAbort = null;
		}
		this.responseEl.empty();
		this.responseEl.createEl('p', { text: 'Request cancelled.', cls: 'vilot-context-label' });
		this.submitBtn.disabled = false;
		this.submitBtn.textContent = 'Ask';
		this.cancelBtn.addClass('vilot-hidden');
	}

	private async submit() {
		const prompt = this.inputEl.value.trim();
		if (!prompt) return;

		this.submitBtn.disabled = true;
		this.submitBtn.textContent = 'Thinking...';
		this.cancelBtn.removeClass('vilot-hidden');
		this.responseEl.empty();
		this.responseEl.createEl('p', { text: 'Waiting for copilot...', cls: 'vilot-loading' });

		const { promise, abort } = this.copilot.ask(
			prompt, this.noteContext, this.settings,
		);
		this.activeAbort = abort;

		try {
			const response = await promise;
			this.responseEl.empty();
			this.responseEl.createEl('h3', { text: 'Response' });

			const responseText = this.responseEl.createEl('div', { cls: 'vilot-response-text' });
			if (this.responseComponent) this.responseComponent.unload();
			this.responseComponent = new Component();
			this.responseComponent.load();
			MarkdownRenderer.render(
				this.app, response, responseText, '', this.responseComponent,
			).catch(() => {
				responseText.textContent = response;
			});
		} catch (err) {
			this.responseEl.empty();
			const message = formatError(err);
			this.responseEl.createEl('p', { text: `Error: ${message}`, cls: 'vilot-error' });
			new Notice(`Vilot error: ${message}`);
		} finally {
			this.activeAbort = null;
			this.submitBtn.disabled = false;
			this.submitBtn.textContent = 'Ask';
			this.cancelBtn.addClass('vilot-hidden');
		}
	}

	onClose() {
		if (this.activeAbort) {
			this.activeAbort();
			this.activeAbort = null;
		}
		if (this.responseComponent) {
			this.responseComponent.unload();
			this.responseComponent = null;
		}
		this.contentEl.empty();
	}
}
