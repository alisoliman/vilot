import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type VilotPlugin from './main';
import { FALLBACK_MODELS, type ModelOption } from './types';

export class VilotSettingTab extends PluginSettingTab {
	plugin: VilotPlugin;
	private activeTab: 'general' | 'models' | 'extensions' = 'general';

	constructor(app: App, plugin: VilotPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass('vilot-settings');

		// Tab nav
		const nav = containerEl.createDiv({ cls: 'vilot-settings-nav' });
		const generalTab = nav.createEl('button', { text: 'General', cls: 'vilot-settings-tab' });
		const modelsTab = nav.createEl('button', { text: 'Models', cls: 'vilot-settings-tab' });
		const extTab = nav.createEl('button', { text: 'Extensions', cls: 'vilot-settings-tab' });

		const content = containerEl.createDiv({ cls: 'vilot-settings-content' });

		const tabs = { general: generalTab, models: modelsTab, extensions: extTab };
		const showTab = (tab: typeof this.activeTab) => {
			this.activeTab = tab;
			for (const [key, el] of Object.entries(tabs)) el.toggleClass('is-active', key === tab);
			content.empty();
			if (tab === 'general') this.renderGeneralTab(content);
			else if (tab === 'models') this.renderModelsTab(content);
			else this.renderExtensionsTab(content);
		};

		generalTab.addEventListener('click', () => showTab('general'));
		modelsTab.addEventListener('click', () => showTab('models'));
		extTab.addEventListener('click', () => showTab('extensions'));
		showTab(this.activeTab);
	}

	private renderGeneralTab(containerEl: HTMLElement): void {
		const authStatusSetting = new Setting(containerEl)
			.setName('Copilot CLI status')
			.setDesc('Checking connection...');

		this.checkAuthStatus(authStatusSetting).catch(err => {
			console.warn('Vilot: failed to check auth status:', err);
		});

		new Setting(containerEl)
			.setName('Conversations folder')
			.setDesc('Choose where past conversations are saved as Markdown notes.')
			.addText(text => {
				text.setPlaceholder('Vilot/conversations')
					.setValue(this.plugin.settings.conversationsFolder)
					.onChange(async (value) => {
						this.plugin.settings.conversationsFolder = value.trim();
						await this.plugin.saveSettings();
					});
			});
	}

	private renderModelsTab(containerEl: HTMLElement): void {
		containerEl.createEl('p', {
			text: 'Toggle which models appear in the chat dropdown.',
			cls: 'vilot-settings-desc',
		});

		const grid = containerEl.createDiv({ cls: 'vilot-model-grid' });

		const renderGrid = (models: ModelOption[]) => {
			grid.empty();
			const hidden = new Set(this.plugin.settings.hiddenModels ?? []);
			for (const model of models) {
				new Setting(grid)
					.setName(model.label)
					.setClass('vilot-model-setting')
					.addToggle(toggle => {
						toggle.setValue(!hidden.has(model.value));
						toggle.onChange(async (visible) => {
							const hiddenSet = new Set(this.plugin.settings.hiddenModels ?? []);
							if (visible) hiddenSet.delete(model.value);
							else hiddenSet.add(model.value);
							this.plugin.settings.hiddenModels = [...hiddenSet];
							await this.plugin.saveSettings();
						});
					});
			}
		};

		renderGrid(FALLBACK_MODELS);

		this.plugin.copilot.listModels().then(models => {
			if (models.length > 0) renderGrid(models);
		}).catch(() => {});
	}

	private renderExtensionsTab(containerEl: HTMLElement): void {
		// --- MCP Servers ---
		new Setting(containerEl).setName('External tool servers').setHeading();
		containerEl.createEl('p', {
			text: 'Configure external MCP servers for additional tools (web search, databases, APIs). Uses the same JSON format as ~/.copilot/mcp-config.json.',
			cls: 'vilot-settings-desc',
		});

		const mcpStatus = containerEl.createDiv({ cls: 'vilot-mcp-status' });
		const mcpTextarea = containerEl.createEl('textarea', {
			cls: 'vilot-json-editor',
			attr: { rows: '8', spellcheck: 'false', placeholder: '{\n  "web-search": {\n    "command": "npx",\n    "args": ["-y", "@mcp/web-search"],\n    "tools": ["*"]\n  }\n}' },
		});
		mcpTextarea.value = this.plugin.settings.mcpServersJson || '{}';

		const validateAndSave = async () => {
			const val = mcpTextarea.value.trim() || '{}';
			try {
				JSON.parse(val);
				mcpStatus.textContent = '';
				mcpStatus.removeClass('vilot-error');
				this.plugin.settings.mcpServersJson = val;
				await this.plugin.saveSettings();
				// Reset session so new MCP config takes effect
				await this.plugin.copilot.resetSession();
			} catch {
				mcpStatus.textContent = 'Invalid JSON';
				mcpStatus.addClass('vilot-error');
			}
		};

		let mcpTimer: ReturnType<typeof setTimeout> | null = null;
		mcpTextarea.addEventListener('input', () => {
			if (mcpTimer) clearTimeout(mcpTimer);
			mcpTimer = setTimeout(() => {
				void validateAndSave();
			}, 800);
		});

		// --- Skill Directories ---
		new Setting(containerEl).setName('Skill directories').setHeading().setClass('vilot-ext-heading');
		containerEl.createEl('p', {
			text: 'Paths to directories containing skill definitions, one per line.',
			cls: 'vilot-settings-desc',
		});

		const skillTextarea = containerEl.createEl('textarea', {
			cls: 'vilot-json-editor vilot-skill-editor',
			attr: { rows: '4', spellcheck: 'false', placeholder: '/path/to/my-skills\n/another/skill-dir' },
		});
		skillTextarea.value = (this.plugin.settings.skillDirectories ?? []).join('\n');

		let skillTimer: ReturnType<typeof setTimeout> | null = null;
		skillTextarea.addEventListener('input', () => {
			if (skillTimer) clearTimeout(skillTimer);
			skillTimer = setTimeout(() => {
				void (async () => {
					this.plugin.settings.skillDirectories = skillTextarea.value
						.split('\n')
						.map(s => s.trim())
						.filter(Boolean);
					await this.plugin.saveSettings();
					await this.plugin.reloadSkillsAndSession();
					this.display();
				})();
			}, 800);
		});

		// --- Install skill from URL ---
		new Setting(containerEl).setName('Install skill from URL').setHeading().setClass('vilot-ext-heading');
		containerEl.createEl('p', {
			text: 'Paste a URL to a skill definition file (blob or raw URL).',
			cls: 'vilot-settings-desc',
		});
		const installStatus = containerEl.createDiv({ cls: 'vilot-mcp-status' });
		let installUrl = '';
		new Setting(containerEl)
			.setName('Skill URL')
			.addText(text => {
				text.setPlaceholder('https://github.com/org/repo/blob/main/skills/my-skill/SKILL.md');
				text.onChange(value => { installUrl = value.trim(); });
			})
			.addButton(btn => {
				btn.setButtonText('Install')
					.setCta()
					.onClick(async () => {
						if (!installUrl) {
							installStatus.textContent = 'Enter a skill URL first.';
							installStatus.addClass('vilot-error');
							return;
						}
						btn.setDisabled(true);
						btn.setButtonText('Installing...');
						installStatus.textContent = 'Installing skill...';
						installStatus.removeClass('vilot-error');
						try {
							const result = await this.plugin.installSkillFromUrl(installUrl);
							installStatus.textContent = `Installed ${result.skill.name}`;
							new Notice(`Vilot: installed skill "${result.skill.name}"`);
							this.display();
						} catch (err) {
							const message = err instanceof Error ? err.message : String(err);
							installStatus.textContent = message;
							installStatus.addClass('vilot-error');
						} finally {
							btn.setDisabled(false);
							btn.setButtonText('Install');
						}
					});
			});

		this.renderLoadedSkills(containerEl);
	}

	private renderLoadedSkills(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Loaded skills').setHeading().setClass('vilot-ext-heading');
		const skills = this.plugin.getLoadedSkills();
		if (skills.length === 0) {
			containerEl.createEl('p', {
				text: 'No skills loaded. Add a skill directory or install one from URL.',
				cls: 'vilot-settings-desc',
			});
			return;
		}

		for (const skill of skills) {
			const sourceLabel = skill.source === 'builtin' ? 'Built-in' : 'User';
			const sourcePath = skill.sourceDirectory;
			const commandLabel = skill.slashCommand ? ` · ${skill.slashCommand}` : '';

			new Setting(containerEl)
				.setName(`${skill.name}${commandLabel}`)
				.setDesc(`${skill.description} (${sourceLabel}: ${sourcePath})`)
				.addToggle(toggle => {
					toggle.setValue(this.plugin.isSkillEnabled(skill.name));
					toggle.onChange(async (enabled) => {
						await this.plugin.setSkillEnabled(skill.name, enabled);
					});
				});
		}
	}

	private async checkAuthStatus(setting: Setting): Promise<void> {
		try {
			if (!this.plugin.copilot.isStarted) {
				setting.setDesc('❌ Copilot client not started. Check the developer console (Ctrl+Shift+I) for errors.');
				return;
			}
			const connected = await this.plugin.copilot.isConnected();
			if (connected) {
				setting.setDesc('✅ connected to copilot CLI.');
			} else {
				setting.setDesc('❌ not connected. Ensure copilot CLI is installed and authenticated.');
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			setting.setDesc(`❌ Could not reach Copilot CLI: ${msg}`);
		}
	}
}
