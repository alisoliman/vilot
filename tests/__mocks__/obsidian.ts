// Mock for the obsidian module used in tests
export class Notice {
	constructor(_message: string, _timeout?: number) {}
	hide() {}
}

export class Modal {
	app: unknown;
	contentEl = {
		empty() {},
		createDiv(_opts?: unknown) { return this; },
		createEl(_tag: string, _opts?: unknown) { return this; },
		addClass(_cls: string) {},
		setAttribute(_k: string, _v: string) {},
	};
	constructor(app: unknown) { this.app = app; }
	open() {}
	close() {}
	onOpen() {}
	onClose() {}
}

export class TFile {
	path = '';
	basename = '';
	extension = 'md';
	stat = { size: 0, mtime: 0, ctime: 0 };
}

export class TFolder {
	path = '';
}

export class Plugin {
	app: unknown;
	manifest = { dir: '' };
	loadData() { return Promise.resolve({}); }
	saveData(_data: unknown) { return Promise.resolve(); }
	addCommand(_cmd: unknown) {}
	addRibbonIcon(_icon: string, _title: string, _cb: () => void) {}
	addSettingTab(_tab: unknown) {}
	registerView(_type: string, _cb: unknown) {}
	registerEvent(_event: unknown) {}
}

export class PluginSettingTab {
	app: unknown;
	containerEl = { empty() {}, createDiv() { return this; }, createEl() { return this; } };
	constructor(app: unknown, _plugin: unknown) { this.app = app; }
	display() {}
}

export class ItemView {
	leaf: unknown;
	app: unknown;
	containerEl = { children: [null, { empty() {}, addClass() {}, createDiv() { return this; }, createEl() { return this; } }] };
	constructor(leaf: unknown) { this.leaf = leaf; }
	getViewType() { return ''; }
	getDisplayText() { return ''; }
}

export class MarkdownView {
	file: TFile | null = null;
	editor = { replaceSelection(_text: string) {} };
}

export class Component {
	load() {}
	unload() {}
}

export class Setting {
	constructor(_el: unknown) {}
	setName(_n: string) { return this; }
	setDesc(_d: string) { return this; }
	setHeading() { return this; }
	setClass(_c: string) { return this; }
	addText(_cb: unknown) { return this; }
	addToggle(_cb: unknown) { return this; }
	addButton(_cb: unknown) { return this; }
}

export class FileSystemAdapter {
	getBasePath() { return '/mock/vault'; }
}

export const MarkdownRenderer = {
	render: async () => {},
};

export const Platform = {
	isWin: false,
	isMacOS: true,
	isLinux: false,
};

export function normalizePath(path: string) { return path; }
export function setIcon(_el: unknown, _icon: string) {}
export function requestUrl(_opts: unknown) { return Promise.resolve({ status: 200, text: '' }); }
