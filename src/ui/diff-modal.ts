import { App, Modal, Notice, TFile } from 'obsidian';
import { computeLineDiff } from '../utils/diff';

export class DiffModal extends Modal {
	private oldContent: string;
	private newContent: string;
	private file: TFile;
	private description: string;
	private onAccept: (() => void) | null = null;

	constructor(
		app: App,
		file: TFile,
		oldContent: string,
		newContent: string,
		description: string,
	) {
		super(app);
		this.file = file;
		this.oldContent = oldContent;
		this.newContent = newContent;
		this.description = description;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('vilot-diff-modal');

		// Header
		const header = contentEl.createDiv({ cls: 'vilot-diff-header' });
		header.createEl('h3', { text: this.description, cls: 'vilot-diff-title' });
		header.createEl('code', { text: this.file.path, cls: 'vilot-diff-file-path' });

		// Diff view
		const diffContainer = contentEl.createDiv({ cls: 'vilot-diff-container' });
		diffContainer.setAttribute('tabindex', '0');
		const diffLines = computeLineDiff(this.oldContent, this.newContent);

		const added = diffLines.filter(l => l.type === 'added').length;
		const removed = diffLines.filter(l => l.type === 'removed').length;

		// Stats badge in header
		if (added || removed) {
			const stats = header.createDiv({ cls: 'vilot-diff-stats' });
			if (added) stats.createEl('span', { text: `+${added}`, cls: 'vilot-diff-stat-added' });
			if (removed) stats.createEl('span', { text: `−${removed}`, cls: 'vilot-diff-stat-removed' });
		}

		let oldLineNum = 0;
		let newLineNum = 0;

		for (const line of diffLines) {
			const lineEl = diffContainer.createDiv({
				cls: `vilot-diff-line vilot-diff-${line.type}`,
			});

			const gutterEl = lineEl.createEl('span', { cls: 'vilot-diff-gutter' });
			const markerEl = lineEl.createEl('span', { cls: 'vilot-diff-marker' });
			const contentSpan = lineEl.createEl('span', { cls: 'vilot-diff-text' });
			contentSpan.textContent = line.text || ' ';

			if (line.type === 'removed') {
				oldLineNum++;
				gutterEl.textContent = String(oldLineNum);
				markerEl.textContent = '−';
			} else if (line.type === 'added') {
				newLineNum++;
				gutterEl.textContent = String(newLineNum);
				markerEl.textContent = '+';
			} else {
				oldLineNum++;
				newLineNum++;
				gutterEl.textContent = String(newLineNum);
				markerEl.textContent = ' ';
			}
		}

		// Buttons
		const btnRow = contentEl.createDiv({ cls: 'vilot-diff-btn-row' });
		const rejectBtn = btnRow.createEl('button', {
			text: 'Reject',
			cls: 'vilot-diff-reject-btn',
		});
		rejectBtn.addEventListener('click', () => this.close());

			const acceptBtn = btnRow.createEl('button', {
				text: 'Accept changes',
				cls: 'vilot-diff-accept-btn mod-cta',
			});
			acceptBtn.addEventListener('click', () => {
				void this.applyChanges();
			});
		}

	private async applyChanges(): Promise<void> {
		try {
			// Guard against stale content — abort if note was edited while modal was open
			const currentContent = await this.app.vault.read(this.file);
			if (currentContent !== this.oldContent) {
				new Notice('Note was modified while the diff was open. Changes not applied.');
				return;
			}
			await this.app.vault.modify(this.file, this.newContent);
			new Notice(`Updated: ${this.file.basename}`);
			if (this.onAccept) this.onAccept();
			this.close();
		} catch (err) {
			new Notice(`Failed to update: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}

	/** Register a callback for when changes are accepted */
	onAccepted(cb: () => void): this {
		this.onAccept = cb;
		return this;
	}
}
