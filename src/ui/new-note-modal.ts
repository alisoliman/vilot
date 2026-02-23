import { App, Modal, Notice, Setting, normalizePath } from 'obsidian';
import type { CopilotService } from '../copilot';
import type { VilotSettings } from '../types';
import { stripCodeFences } from '../utils';

export class NewNoteModal extends Modal {
	private copilot: CopilotService;
	private settings: VilotSettings;
	private promptInput: HTMLTextAreaElement;
	private fileNameInput: HTMLInputElement;
	private folderInput: HTMLInputElement;
	private generateBtn: HTMLButtonElement;
	private statusEl: HTMLElement;
	private activeAbort: (() => void) | null = null;

	constructor(app: App, copilot: CopilotService, settings: VilotSettings) {
		super(app);
		this.copilot = copilot;
		this.settings = settings;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('vilot-new-note-modal');

		contentEl.createEl('h2', { text: 'Generate new note' });

		// Prompt
		new Setting(contentEl)
				.setName('Describe the note you want')
				.addTextArea(text => {
					this.promptInput = text.inputEl;
					text.setPlaceholder('E.g. "a meeting notes template with sections for agenda, attendees, and action items"');
					text.inputEl.rows = 4;
					text.inputEl.addClass('vilot-new-note-prompt');
				});

		// File name
		new Setting(contentEl)
				.setName('File name')
				.setDesc('Without .md extension')
				.addText(text => {
					this.fileNameInput = text.inputEl;
					text.setPlaceholder('My new note');
				});

		// Folder
		new Setting(contentEl)
			.setName('Folder')
			.setDesc('Leave empty for vault root')
			.addText(text => {
				this.folderInput = text.inputEl;
				text.setPlaceholder('/');
			});

		// Buttons
		const btnSetting = new Setting(contentEl);
		btnSetting.addButton(btn => {
			this.generateBtn = btn.buttonEl;
			btn.setButtonText('Generate')
				.setCta()
				.onClick(() => this.generate());
		});
		btnSetting.addButton(btn => {
			btn.setButtonText('Cancel')
				.onClick(() => this.close());
		});

		this.statusEl = contentEl.createDiv({ cls: 'vilot-new-note-status' });

		requestAnimationFrame(() => this.promptInput.focus());
	}

	private async generate(): Promise<void> {
		const description = this.promptInput.value.trim();
		if (!description) {
			new Notice('Please describe the note you want to generate.');
			return;
		}

		const fileName = this.fileNameInput.value.trim() || 'Untitled';
		const folder = this.folderInput.value.trim();
		const filePath = normalizePath(
			folder ? `${folder}/${fileName}.md` : `${fileName}.md`,
		);

		// Check if file already exists
		const existing = this.app.vault.getAbstractFileByPath(filePath);
		if (existing) {
			new Notice(`File already exists: ${filePath}`);
			return;
		}

		this.generateBtn.disabled = true;
		this.generateBtn.textContent = 'Generating...';
		this.statusEl.textContent = 'Waiting for copilot...';
		this.statusEl.removeClass('vilot-error');

		const prompt = `Generate a complete Markdown note based on this description: "${description}"\n\n`
			+ `The note title is "${fileName}". Return ONLY the Markdown content of the note, nothing else. `
			+ `Do not wrap in code fences.`;

		const { promise, abort } = this.copilot.ask(prompt, null, this.settings);
		this.activeAbort = abort;

		try {
			const rawContent = await promise;
			const content = stripCodeFences(rawContent);

			// Ensure parent folders exist, creating each level as needed
			if (folder) {
				const folderNormalized = normalizePath(folder);
				const segments = folderNormalized.split('/');
				let current = '';
				for (const seg of segments) {
					current = current ? `${current}/${seg}` : seg;
					if (!this.app.vault.getAbstractFileByPath(current)) {
						await this.app.vault.createFolder(current);
					}
				}
			}

			await this.app.vault.create(filePath, content);
			new Notice(`Created: ${filePath}`);

			// Open the new note
			const newFile = this.app.vault.getAbstractFileByPath(filePath);
			if (newFile) {
				await this.app.workspace.getLeaf().openFile(newFile as import('obsidian').TFile);
			}

			this.close();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			this.statusEl.textContent = `Error: ${msg}`;
			this.statusEl.addClass('vilot-error');
		} finally {
			this.activeAbort = null;
			this.generateBtn.disabled = false;
			this.generateBtn.textContent = 'Generate';
		}
	}

	onClose(): void {
		if (this.activeAbort) {
			this.activeAbort();
			this.activeAbort = null;
		}
		this.contentEl.empty();
	}
}
