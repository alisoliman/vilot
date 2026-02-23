import { existsSync, realpathSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { requestUrl } from 'obsidian';

export type SkillSource = 'builtin' | 'user';

export interface SkillDefinition {
	name: string;
	description: string;
	triggers: string[];
	slashCommand?: string;
	body: string;
	source: SkillSource;
	sourceDirectory: string;
	filePath: string;
}

export interface SkillMatchResult {
	skill: SkillDefinition;
	matchType: 'slash' | 'trigger';
	cleanedPrompt: string;
	matchedTrigger?: string;
}

export interface InstallSkillResult {
	skill: SkillDefinition;
	installedFilePath: string;
	userSkillsDirectory: string;
	normalizedUrl: string;
}

interface ParsedSkillContent {
	name: string;
	description: string;
	triggers: string[];
	slashCommand?: string;
	body: string;
}

function normalizeSkillName(value: string): string {
	return value.trim().toLowerCase();
}

function uniqueValues(values: string[]): string[] {
	return [...new Set(values)];
}

function slugify(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		|| 'skill';
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findTriggerIndex(message: string, trigger: string): number {
	if (!trigger) return -1;
	const escaped = escapeRegex(trigger);
	// Require non-word boundaries around triggers to avoid false positives
	// like "research" matching "search".
	const pattern = new RegExp(`(^|[^a-z0-9_])(${escaped})(?=$|[^a-z0-9_])`, 'g');
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(message)) !== null) {
		const prefixLen = match[1]?.length ?? 0;
		const triggerStart = (match.index ?? 0) + prefixLen;
		// Skip matches preceded by negation words (e.g. "don't summarize")
		const before = message.slice(0, triggerStart).trimEnd();
		if (/(?:don'?t|do not|never|no|isn'?t|aren'?t|wasn'?t|won'?t|can'?t|cannot|shouldn'?t|wouldn'?t|doesn'?t|didn'?t|not|without)$/i.test(before)) {
			continue;
		}
		return triggerStart;
	}
	return -1;
}

function parseScalar(raw: string): string | number | boolean | string[] {
	const trimmed = raw.trim();
	if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
		return trimmed.slice(1, -1);
	}
	if (trimmed === 'true') return true;
	if (trimmed === 'false') return false;
	if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
		const parsed = Number(trimmed);
		if (!Number.isNaN(parsed)) return parsed;
	}
	const inlineListMatch = trimmed.match(/^\[(.*)\]$/);
	if (inlineListMatch) {
		return inlineListMatch[1]!
			.split(',')
			.map(part => String(parseScalar(part.trim())))
			.map(part => part.trim())
			.filter(Boolean);
	}
	return trimmed;
}

function parseSimpleYaml(frontmatter: string): Record<string, unknown> {
	const parsed: Record<string, unknown> = {};
	let currentListKey: string | null = null;

	for (const rawLine of frontmatter.split(/\r?\n/)) {
		const line = rawLine.replace(/\t/g, '  ');
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;

		const listMatch = line.match(/^\s*-\s*(.+)\s*$/);
		if (listMatch && currentListKey) {
			const current = parsed[currentListKey];
			if (Array.isArray(current)) {
				current.push(String(parseScalar(listMatch[1]!)).trim());
			}
			continue;
		}

		const keyValueMatch = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
		if (!keyValueMatch) {
			currentListKey = null;
			continue;
		}

		const key = keyValueMatch[1]!;
		const valuePart = keyValueMatch[2]!;
		if (valuePart === '') {
			parsed[key] = [];
			currentListKey = key;
			continue;
		}

		parsed[key] = parseScalar(valuePart);
		currentListKey = null;
	}

	return parsed;
}

function toStringArray(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value
			.map(v => String(v).trim())
			.filter(Boolean);
	}
	if (typeof value === 'string') {
		if (value.includes(',')) {
			return value.split(',').map(v => v.trim()).filter(Boolean);
		}
		return value.trim() ? [value.trim()] : [];
	}
	return [];
}

function normalizeSlashCommand(value: string | undefined): string | undefined {
	if (!value) return undefined;
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function parseSkillMarkdown(content: string): ParsedSkillContent | null {
	const frontmatterMatch = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)([\s\S]*)$/);
	if (!frontmatterMatch) return null;

	const rawMetadata = parseSimpleYaml(frontmatterMatch[1]!);
	const name = typeof rawMetadata.name === 'string' ? rawMetadata.name.trim() : '';
	const description = typeof rawMetadata.description === 'string' ? rawMetadata.description.trim() : '';
	const body = frontmatterMatch[2]!.trim();
	if (!name || !description || !body) return null;

	const triggerValues = toStringArray(rawMetadata.triggers)
		.map(trigger => trigger.toLowerCase())
		.filter(Boolean);
	const triggers = uniqueValues(triggerValues.length > 0 ? triggerValues : [name.toLowerCase()]);

	let slashCommand: string | undefined;
	if (typeof rawMetadata.slashCommand === 'string') {
		slashCommand = normalizeSlashCommand(rawMetadata.slashCommand);
	}

	return {
		name,
		description,
		triggers,
		slashCommand,
		body,
	};
}

function asRawGithubUrl(input: string): string {
	let parsed: URL;
	try {
		parsed = new URL(input.trim());
	} catch {
		throw new Error('Invalid URL. Provide a full GitHub URL to SKILL.md.');
	}

	if (parsed.hostname === 'raw.githubusercontent.com') {
		return parsed.toString();
	}

	if (parsed.hostname !== 'github.com') {
		throw new Error('Only github.com and raw.githubusercontent.com URLs are supported.');
	}

	const segments = parsed.pathname.split('/').filter(Boolean);
	if (segments.length < 5) {
		throw new Error('GitHub URL must point to a SKILL.md file path.');
	}

	const owner = segments[0]!;
	const repo = segments[1]!;
	const mode = segments[2]!;

	if (mode === 'blob' || mode === 'raw') {
		const ref = segments[3]!;
		const pathParts = segments.slice(4);
		if (pathParts.length === 0) {
			throw new Error('GitHub URL must include a file path.');
		}
		const path = pathParts.join('/');
		return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`;
	}

	if (mode === 'tree') {
		const ref = segments[3]!;
		const pathParts = segments.slice(4);
		const path = [...pathParts, 'SKILL.md'].join('/');
		return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`;
	}

	throw new Error('Unsupported GitHub URL format. Use a file URL containing /blob/.');
}

export class SkillManager {
	private pluginDir: string;
	private defaultUserSkillsDirectory: string;
	private skills: SkillDefinition[] = [];
	private builtInSkillDirectories: string[] = [];

	constructor(pluginDir: string) {
		this.pluginDir = pluginDir;
		this.defaultUserSkillsDirectory = pluginDir ? join(pluginDir, 'user-skills') : '';
	}

	getDefaultUserSkillsDirectory(): string {
		return this.defaultUserSkillsDirectory;
	}

	getSkills(): SkillDefinition[] {
		return [...this.skills];
	}

	getEnabledSkills(disabledSkills: string[]): SkillDefinition[] {
		const disabled = new Set(disabledSkills.map(normalizeSkillName));
		return this.skills.filter(skill => !disabled.has(normalizeSkillName(skill.name)));
	}

	getSlashCommandSkills(disabledSkills: string[]): SkillDefinition[] {
		return this.getEnabledSkills(disabledSkills)
			.filter(skill => !!skill.slashCommand)
			.sort((a, b) => (a.slashCommand ?? '').localeCompare(b.slashCommand ?? ''));
	}

	isSkillEnabled(skillName: string, disabledSkills: string[]): boolean {
		const disabled = new Set(disabledSkills.map(normalizeSkillName));
		return !disabled.has(normalizeSkillName(skillName));
	}

	async load(userSkillDirectories: string[]): Promise<void> {
		const registry = new Map<string, SkillDefinition>();
		this.builtInSkillDirectories = this.resolveBuiltInSkillDirectories();

		for (const dir of this.builtInSkillDirectories) {
			await this.loadDirectorySkills(dir, 'builtin', registry);
		}

		for (const dir of userSkillDirectories.map(d => d.trim()).filter(Boolean)) {
			await this.loadDirectorySkills(dir, 'user', registry);
		}

		this.skills = [...registry.values()].sort((a, b) => a.name.localeCompare(b.name));
	}

	getSdkSkillDirectories(userSkillDirectories: string[]): string[] {
		const builtIn = this.builtInSkillDirectories.length > 0
			? this.builtInSkillDirectories
			: this.resolveBuiltInSkillDirectories();
		const user = userSkillDirectories.map(d => d.trim()).filter(Boolean);
		return uniqueValues([...builtIn, ...user]);
	}

	matchSkill(message: string, disabledSkills: string[]): SkillMatchResult | null {
		const enabledSkills = this.getEnabledSkills(disabledSkills);
		if (enabledSkills.length === 0) return null;

		const slashMatch = message.match(/^\s*(\/[^\s]+)(?:\s+|$)([\s\S]*)$/);
		if (slashMatch) {
			const slashCommand = slashMatch[1]!.toLowerCase();
			const matched = enabledSkills.find(skill => (skill.slashCommand ?? '').toLowerCase() === slashCommand);
			if (matched) {
				return {
					skill: matched,
					matchType: 'slash',
					cleanedPrompt: slashMatch[2]?.trim() ?? '',
				};
			}
		}

		const normalizedMessage = message.toLowerCase();
		let bestMatch: { skill: SkillDefinition; trigger: string; score: number } | null = null;

		for (const skill of enabledSkills) {
			const triggerCandidates = uniqueValues([...skill.triggers, skill.name.toLowerCase()]);
			for (const trigger of triggerCandidates) {
				if (!trigger) continue;
				const index = findTriggerIndex(normalizedMessage, trigger);
				if (index === -1) continue;

				const score = trigger.length * 100 - index;
				if (!bestMatch || score > bestMatch.score) {
					bestMatch = { skill, trigger, score };
				}
			}
		}

		if (!bestMatch) return null;
		return {
			skill: bestMatch.skill,
			matchType: 'trigger',
			matchedTrigger: bestMatch.trigger,
			cleanedPrompt: message.trim(),
		};
	}

	async installFromUrl(rawUrl: string): Promise<InstallSkillResult> {
		if (!this.defaultUserSkillsDirectory) {
			throw new Error('Plugin directory is unavailable; cannot install skills.');
		}

		const normalizedUrl = asRawGithubUrl(rawUrl);
		const response = await requestUrl({ url: normalizedUrl, method: 'GET' });
		if (response.status < 200 || response.status >= 300) {
			throw new Error(`Failed to fetch SKILL.md (${response.status})`);
		}
		const markdown = response.text;
		const parsed = parseSkillMarkdown(markdown);
		if (!parsed) {
			throw new Error('Downloaded file is not a valid SKILL.md with frontmatter metadata.');
		}

		const directoryName = slugify(parsed.name);
		const targetDirectory = join(this.defaultUserSkillsDirectory, directoryName);
		const targetFile = join(targetDirectory, 'SKILL.md');

		await mkdir(targetDirectory, { recursive: true });
		await writeFile(targetFile, markdown, 'utf8');

		const skill: SkillDefinition = {
			...parsed,
			source: 'user',
			sourceDirectory: targetDirectory,
			filePath: targetFile,
		};

		return {
			skill,
			installedFilePath: targetFile,
			userSkillsDirectory: this.defaultUserSkillsDirectory,
			normalizedUrl,
		};
	}

	private resolveBuiltInSkillDirectories(): string[] {
		if (!this.pluginDir) return [];

		const candidates = [join(this.pluginDir, 'skills')];
		try {
			const realMainPath = realpathSync(join(this.pluginDir, 'main.js'));
			const projectRoot = dirname(realMainPath);
			if (projectRoot !== this.pluginDir) {
				candidates.push(join(projectRoot, 'skills'));
			}
		} catch {
			// Ignore when main.js does not exist yet.
		}

		return uniqueValues(candidates.filter(dir => existsSync(dir)));
	}

	private async loadDirectorySkills(
		rootDirectory: string,
		source: SkillSource,
		registry: Map<string, SkillDefinition>,
	): Promise<void> {
		if (!existsSync(rootDirectory)) return;

		const skillFiles = await this.collectSkillFiles(rootDirectory);
		for (const filePath of skillFiles) {
			const loaded = await this.loadSkillFile(filePath, source);
			if (!loaded) continue;
			registry.set(normalizeSkillName(loaded.name), loaded);
		}
	}

	private async collectSkillFiles(rootDirectory: string): Promise<string[]> {
		const files: string[] = [];
		const stack: string[] = [rootDirectory];

		while (stack.length > 0) {
			const current = stack.pop();
			if (!current) continue;
			let entries;
			try {
				entries = await readdir(current, { withFileTypes: true });
			} catch {
				continue;
			}

			for (const entry of entries) {
				const fullPath = join(current, entry.name);
				if (entry.isDirectory()) {
					stack.push(fullPath);
					continue;
				}
				if (entry.isFile() && entry.name === 'SKILL.md') {
					files.push(fullPath);
				}
			}
		}

		return files;
	}

	private async loadSkillFile(filePath: string, source: SkillSource): Promise<SkillDefinition | null> {
		let raw: string;
		try {
			raw = await readFile(filePath, 'utf8');
		} catch {
			return null;
		}

		const parsed = parseSkillMarkdown(raw);
		if (!parsed) return null;

		return {
			...parsed,
			source,
			sourceDirectory: dirname(filePath),
			filePath,
		};
	}
}
