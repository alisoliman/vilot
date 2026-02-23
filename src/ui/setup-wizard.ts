import { Modal, Notice, Setting, setIcon, type App } from 'obsidian';
import type { CopilotService } from '../copilot';
import type { VilotSettings } from '../types';
import { formatError } from '../utils';

type CheckState = 'idle' | 'running' | 'success' | 'failure';

interface SetupWizardCallbacks {
	getSettings: () => VilotSettings;
	onComplete: () => Promise<void>;
}

export class SetupWizardModal extends Modal {
	private copilot: CopilotService;
	private callbacks: SetupWizardCallbacks;
	private step = 0;
	private cliState: CheckState = 'idle';
	private authState: CheckState = 'idle';
	private testState: CheckState = 'idle';
	private cliMessage = '';
	private authMessage = '';
	private testMessage = '';
	private testResponse = '';
	private activeAbort: (() => void) | null = null;

	constructor(app: App, copilot: CopilotService, callbacks: SetupWizardCallbacks) {
		super(app);
		this.copilot = copilot;
		this.callbacks = callbacks;
	}

	onOpen(): void {
		this.modalEl.addClass('vilot-setup-modal');
		this.render();
	}

	onClose(): void {
		if (this.activeAbort) {
			this.activeAbort();
			this.activeAbort = null;
		}
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Vilot setup wizard' });
		contentEl.createEl('p', {
			text: 'Complete these checks once to ensure copilot connectivity is working.',
			cls: 'vilot-setup-subtitle',
		});

		this.renderProgress(contentEl);
		const body = contentEl.createDiv({ cls: 'vilot-setup-step' });
		if (this.step === 0) this.renderCliStep(body);
		else if (this.step === 1) this.renderAuthStep(body);
		else if (this.step === 2) this.renderTestStep(body);
		else this.renderDoneStep(body);
	}

	private renderProgress(containerEl: HTMLElement): void {
		const labels = ['CLI check', 'Auth check', 'Test message', 'Done'];
		const progress = containerEl.createDiv({ cls: 'vilot-setup-progress' });
		for (let i = 0; i < labels.length; i++) {
			const item = progress.createDiv({ cls: 'vilot-setup-progress-item' });
			if (i < this.step) item.addClass('is-complete');
			if (i === this.step) item.addClass('is-active');
			const icon = item.createDiv({ cls: 'vilot-setup-progress-icon' });
			setIcon(icon, i < this.step ? 'check' : 'circle');
			item.createDiv({ cls: 'vilot-setup-progress-label', text: labels[i]! });
		}
	}

	private renderCliStep(containerEl: HTMLElement): void {
		containerEl.createEl('h3', { text: 'Step 1: CLI check' });
		containerEl.createEl('p', {
			text: 'Verify vilot can reach the copilot CLI process.',
			cls: 'vilot-setup-step-desc',
		});

		this.renderState(containerEl, this.cliState, this.cliMessage || 'Not checked yet.');
		if (this.cliState === 'failure') {
			containerEl.createEl('pre', {
				text: 'Install with: npm install -g @GitHub/copilot\nthen run: copilot auth login',
				cls: 'vilot-setup-help',
			});
		}

			this.renderActionRow(containerEl, {
				onCheck: () => {
					void this.runCliCheck();
				},
				nextDisabled: this.cliState !== 'success',
				onNext: () => this.nextStep(),
			});
	}

	private renderAuthStep(containerEl: HTMLElement): void {
		containerEl.createEl('h3', { text: 'Step 2: auth check' });
		containerEl.createEl('p', {
			text: 'Verify your copilot account is authenticated by listing available models.',
			cls: 'vilot-setup-step-desc',
		});

		this.renderState(containerEl, this.authState, this.authMessage || 'Not checked yet.');
		if (this.authState === 'failure') {
			containerEl.createEl('pre', {
				text: 'Run in terminal: copilot auth login',
				cls: 'vilot-setup-help',
			});
		}

			this.renderActionRow(containerEl, {
				onBack: () => this.prevStep(),
				onCheck: () => {
					void this.runAuthCheck();
				},
				nextDisabled: this.authState !== 'success',
				onNext: () => this.nextStep(),
			});
	}

	private renderTestStep(containerEl: HTMLElement): void {
		containerEl.createEl('h3', { text: 'Step 3: test message' });
		containerEl.createEl('p', {
			text: 'Send a test prompt and confirm a model response is returned.',
			cls: 'vilot-setup-step-desc',
		});

		this.renderState(containerEl, this.testState, this.testMessage || 'Not checked yet.');
		if (this.testResponse) {
			new Setting(containerEl)
				.setName('Response preview')
				.setDesc(this.testResponse.slice(0, 240));
		}

			this.renderActionRow(containerEl, {
				onBack: () => this.prevStep(),
				onCheck: () => {
					void this.runTestMessage();
				},
				nextDisabled: this.testState !== 'success',
				onNext: () => this.nextStep(),
			});
	}

	private renderDoneStep(containerEl: HTMLElement): void {
		containerEl.createEl('h3', { text: 'Step 4: done' });
		containerEl.createEl('p', {
			text: 'Setup is complete. Vilot is ready to help across your vault.',
			cls: 'vilot-setup-step-desc',
		});
		this.renderState(containerEl, 'success', 'All checks passed.');

		const actions = containerEl.createDiv({ cls: 'vilot-setup-actions' });
		actions.createEl('button', { text: 'Back', cls: 'vilot-diff-reject-btn' })
			.addEventListener('click', () => this.prevStep());
		actions.createEl('button', { text: 'Finish', cls: 'vilot-diff-accept-btn mod-cta' })
			.addEventListener('click', () => {
				this.finish().catch(err => {
					new Notice(`Vilot setup failed: ${formatError(err)}`);
				});
			});
	}

	private renderState(containerEl: HTMLElement, state: CheckState, message: string): void {
		const row = containerEl.createDiv({ cls: `vilot-setup-status is-${state}` });
		const iconEl = row.createDiv({ cls: 'vilot-setup-status-icon' });
		if (state === 'success') setIcon(iconEl, 'check-circle');
		else if (state === 'failure') setIcon(iconEl, 'x-circle');
		else if (state === 'running') setIcon(iconEl, 'loader');
		else setIcon(iconEl, 'circle');
		row.createDiv({ cls: 'vilot-setup-status-text', text: message });
	}

	private renderActionRow(
		containerEl: HTMLElement,
		options: {
			onBack?: () => void;
			onCheck: () => void;
			onNext: () => void;
			nextDisabled: boolean;
		},
	): void {
		const actions = containerEl.createDiv({ cls: 'vilot-setup-actions' });
		if (options.onBack) {
			actions.createEl('button', { text: 'Back', cls: 'vilot-diff-reject-btn' })
				.addEventListener('click', options.onBack);
		}
		actions.createEl('button', { text: 'Check', cls: 'vilot-diff-reject-btn' })
			.addEventListener('click', options.onCheck);
		const nextButton = actions.createEl('button', {
			text: 'Next',
			cls: 'vilot-diff-accept-btn mod-cta',
		});
		nextButton.disabled = options.nextDisabled;
		nextButton.addEventListener('click', options.onNext);
	}

	private nextStep(): void {
		this.step = Math.min(3, this.step + 1);
		this.render();
	}

	private prevStep(): void {
		this.step = Math.max(0, this.step - 1);
		this.render();
	}

	private async runCliCheck(): Promise<void> {
		this.cliState = 'running';
		this.cliMessage = 'Checking Copilot CLI connection...';
		this.render();

		try {
			if (!this.copilot.isStarted) {
				await this.copilot.start();
			}
			const connected = await this.copilot.isConnected();
			if (connected) {
				this.cliState = 'success';
				this.cliMessage = 'Connected to Copilot CLI.';
			} else {
				this.cliState = 'failure';
				this.cliMessage = 'Copilot CLI is not reachable.';
			}
		} catch (err) {
			this.cliState = 'failure';
			this.cliMessage = formatError(err);
		}

		this.render();
	}

	private async runAuthCheck(): Promise<void> {
		this.authState = 'running';
		this.authMessage = 'Checking authentication state...';
		this.render();

		try {
			const models = await this.copilot.listModels();
			if (models.length > 0) {
				this.authState = 'success';
				this.authMessage = `Authenticated. Found ${models.length} available models.`;
			} else {
				this.authState = 'failure';
				this.authMessage = 'Could not list models. Your Copilot session may need login.';
			}
		} catch (err) {
			this.authState = 'failure';
			this.authMessage = formatError(err);
		}

		this.render();
	}

	private async runTestMessage(): Promise<void> {
		this.testState = 'running';
		this.testMessage = 'Sending test message...';
		this.testResponse = '';
		this.render();

		try {
			const { promise, abort } = this.copilot.ask(
				'Reply with: "Vilot setup test successful."',
				null,
				this.callbacks.getSettings(),
			);
			this.activeAbort = abort;
			const response = await promise;
			this.activeAbort = null;
			this.testResponse = response.trim();
			if (this.testResponse.length > 0) {
				this.testState = 'success';
				this.testMessage = 'Test message succeeded.';
			} else {
				this.testState = 'failure';
				this.testMessage = 'No response was returned for test message.';
			}
		} catch (err) {
			this.activeAbort = null;
			this.testState = 'failure';
			this.testMessage = formatError(err);
		}

		this.render();
	}

	private async finish(): Promise<void> {
		await this.callbacks.onComplete();
		new Notice('Vilot setup complete.');
		this.close();
	}
}
