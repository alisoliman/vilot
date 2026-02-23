import { FileSystemAdapter, MarkdownView, Notice, Plugin } from 'obsidian';
import { CopilotService } from './copilot';
import { VIEW_TYPE_VILOT_CHAT, VILOT_ICON_NAME } from './constants';
import { summarizeNote, generateTags, extractActionItems, updateFrontmatter, insertLastResponseAtCursor } from './note-actions';
import { SkillManager, type InstallSkillResult, type SkillDefinition } from './skills';
import { VilotSettingTab } from './settings';
import { DEFAULT_SETTINGS, type VilotSettings } from './types';
import { AskCopilotModal } from './ui/ask-modal';
import { VilotChatView } from './ui/chat-view';
import { NewNoteModal } from './ui/new-note-modal';
import { SetupWizardModal } from './ui/setup-wizard';
import { getActiveNoteContext } from './utils';
import { createVaultTools } from './vault-tools';

export default class VilotPlugin extends Plugin {
	settings: VilotSettings;
	copilot: CopilotService;
	skillManager: SkillManager;

	async onload() {
		await this.loadSettings();

		this.copilot = new CopilotService();
		const adapter = this.app.vault.adapter;
		const basePath = adapter instanceof FileSystemAdapter ? adapter.getBasePath() : '';
		const pluginDir = basePath ? `${basePath}/${this.manifest.dir}` : '';
		this.copilot.setPluginDir(pluginDir);
		this.skillManager = new SkillManager(pluginDir);
		await this.reloadSkills();

		// Register vault tools
		const vaultTools = createVaultTools(this.app);
		this.copilot.setTools(vaultTools);

		// Initialize SDK in background — don't block plugin load
		this.copilot.setCliPath(this.settings.cliPath).then(() =>
			this.copilot.start()
		).then(() => {
			console.debug('Vilot: Copilot SDK started successfully');
		}).catch((err: unknown) => {
			const message = err instanceof Error ? err.message : String(err);
			console.warn('Vilot: Could not start Copilot SDK:', message);
			new Notice(
				'Vilot: Could not connect to Copilot CLI.\n\n'
				+ '1. Install: npm install -g @github/copilot\n'
				+ '2. Authenticate: copilot auth login\n'
				+ '3. Reload Obsidian\n\n'
				+ 'Or set the CLI path in Vilot settings.',
				15000,
			);
		});

		// Register chat view
		this.registerView(
			VIEW_TYPE_VILOT_CHAT,
			(leaf) => new VilotChatView(
				leaf,
				this.copilot,
				this.skillManager,
				() => this.settings,
				() => this.saveSettings(),
			),
		);

		// Ribbon icon
		this.addRibbonIcon(VILOT_ICON_NAME, 'Open vilot chat', () => {
			void this.activateChatView();
		});

		// Commands
		this.addCommand({
			id: 'open-chat',
			name: 'Open chat',
			callback: () => this.activateChatView(),
		});

		this.addCommand({
			id: 'ask-copilot',
			name: 'Ask copilot quickly',
			callback: () => {
				const noteContext = getActiveNoteContext(this.app);
				new AskCopilotModal(
					this.app,
					this.copilot,
					this.settings,
					noteContext,
				).open();
			},
		});

		this.addCommand({
			id: 'ask-about-vault',
			name: 'Ask about vault',
			callback: async () => {
				await this.activateChatView();
				// Prime the chat with a vault-focused hint
				const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_VILOT_CHAT);
				if (leaves.length > 0) {
					const view = leaves[0]!.view as VilotChatView;
					view.primeForVault();
				}
			},
		});

		// M3: Note action commands
		this.addCommand({
			id: 'summarize-note',
			name: 'Summarize note',
			editorCheckCallback: (checking) => {
				if (checking) return !!this.app.workspace.getActiveViewOfType(MarkdownView);
				summarizeNote(this.app, this.copilot, this.settings).catch(() => {});
				return true;
			},
		});

		this.addCommand({
			id: 'generate-tags',
			name: 'Generate tags',
			editorCheckCallback: (checking) => {
				if (checking) return !!this.app.workspace.getActiveViewOfType(MarkdownView);
				generateTags(this.app, this.copilot, this.settings).catch(() => {});
				return true;
			},
		});

		this.addCommand({
			id: 'extract-action-items',
			name: 'Extract action items',
			editorCheckCallback: (checking) => {
				if (checking) return !!this.app.workspace.getActiveViewOfType(MarkdownView);
				extractActionItems(this.app, this.copilot, this.settings).catch(() => {});
				return true;
			},
		});

		this.addCommand({
			id: 'update-frontmatter',
			name: 'Update frontmatter',
			editorCheckCallback: (checking) => {
				if (checking) return !!this.app.workspace.getActiveViewOfType(MarkdownView);
				updateFrontmatter(this.app, this.copilot, this.settings).catch(() => {});
				return true;
			},
		});

		this.addCommand({
			id: 'insert-response-at-cursor',
			name: 'Insert last response at cursor',
			editorCheckCallback: (checking) => {
				if (checking) return !!this.app.workspace.getActiveViewOfType(MarkdownView);
				const lastResponse = this.getLastAssistantResponse();
				insertLastResponseAtCursor(this.app, lastResponse);
				return true;
			},
		});

		this.addCommand({
			id: 'generate-note',
			name: 'Generate new note from prompt',
			callback: () => {
				new NewNoteModal(this.app, this.copilot, this.settings).open();
			},
		});

		this.addSettingTab(new VilotSettingTab(this.app, this));

		if (!this.settings.setupComplete) {
			window.setTimeout(() => this.openSetupWizard(), 250);
		}
	}

	onunload(): void {
		void this.copilot.stop();
	}

	async activateChatView(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_VILOT_CHAT);
		if (existing.length > 0) {
			await this.app.workspace.revealLeaf(existing[0]!);
			return;
		}
		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: VIEW_TYPE_VILOT_CHAT, active: true });
			await this.app.workspace.revealLeaf(leaf);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<VilotSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	getLoadedSkills(): SkillDefinition[] {
		return this.skillManager.getSkills();
	}

	isSkillEnabled(skillName: string): boolean {
		return this.skillManager.isSkillEnabled(skillName, this.settings.disabledSkills ?? []);
	}

	async setSkillEnabled(skillName: string, enabled: boolean): Promise<void> {
		const existing = this.settings.disabledSkills ?? [];
		const normalized = skillName.trim().toLowerCase();
		let next = existing.filter(name => name.trim().toLowerCase() !== normalized);
		if (!enabled) {
			next = [...next, skillName];
		}
		this.settings.disabledSkills = next;
		await this.saveSettings();
		await this.copilot.resetSession();
	}

	async reloadSkills(): Promise<void> {
		await this.skillManager.load(this.settings.skillDirectories ?? []);
		this.copilot.setSkillDirectories(
			this.skillManager.getSdkSkillDirectories(this.settings.skillDirectories ?? []),
		);
	}

	async reloadSkillsAndSession(): Promise<void> {
		await this.reloadSkills();
		await this.copilot.resetSession();
	}

	async installSkillFromUrl(url: string): Promise<InstallSkillResult> {
		const installResult = await this.skillManager.installFromUrl(url);
		const userDir = installResult.userSkillsDirectory;
		const configured = new Set((this.settings.skillDirectories ?? []).map(path => path.trim()).filter(Boolean));
		if (!configured.has(userDir)) {
			this.settings.skillDirectories = [...configured, userDir];
		}
		await this.reloadSkills();
		await this.saveSettings();
		await this.copilot.resetSession();
		return installResult;
	}

	private openSetupWizard(): void {
		new SetupWizardModal(this.app, this.copilot, {
			getSettings: () => this.settings,
			onComplete: async () => {
				this.settings.setupComplete = true;
				await this.saveSettings();
				await this.activateChatView();
			},
		}).open();
	}

	private getLastAssistantResponse(): string {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_VILOT_CHAT);
		if (leaves.length > 0) {
			const view = leaves[0]!.view as VilotChatView;
			return view.getLastAssistantResponse();
		}
		return '';
	}
}
