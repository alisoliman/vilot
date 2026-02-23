import { FileSystemAdapter, MarkdownView, type App, type TFile } from 'obsidian';
import type { NoteContext } from './types';

/** Resolve a TFile to a NoteContext with absolute disk path. */
export function fileToNoteContext(app: App, file: TFile): NoteContext {
	const adapter = app.vault.adapter;
	const basePath = adapter instanceof FileSystemAdapter ? adapter.getBasePath() : '';
	return {
		absolutePath: basePath ? `${basePath}/${file.path}` : file.path,
		title: file.basename,
	};
}

/** Get the NoteContext for the currently active markdown note, or null. */
export function getActiveNoteContext(app: App): NoteContext | null {
	const view = app.workspace.getActiveViewOfType(MarkdownView);
	if (!view?.file) return null;
	return fileToNoteContext(app, view.file);
}

/** Map raw error messages to user-friendly strings. */
export function formatError(err: unknown): string {
	const msg = err instanceof Error ? err.message : String(err);
	if (msg.includes('ENOENT') || msg.includes('not found')) {
		return 'Copilot CLI not found. Install it and reload the plugin.';
	}
	if (msg.includes('auth') || msg.includes('401') || msg.includes('unauthorized')) {
		return 'Authentication expired. Run "copilot auth login" in your terminal.';
	}
	if (msg.includes('rate') || msg.includes('429') || msg.includes('quota')) {
		return 'Rate limit reached. Please wait a moment and try again.';
	}
	return msg;
}

/** Strip wrapping code fences from AI responses. */
export function stripCodeFences(text: string): string {
	const trimmed = text.trim();
	if (trimmed.startsWith('```')) {
		const firstNewline = trimmed.indexOf('\n');
		const lastFence = trimmed.lastIndexOf('```');
		if (lastFence > firstNewline) {
			return trimmed.slice(firstNewline + 1, lastFence).trim();
		}
	}
	return trimmed;
}
