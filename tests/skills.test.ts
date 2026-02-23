import { describe, it, expect, beforeEach } from 'vitest';
import { SkillManager, type SkillDefinition } from '../src/skills';

// Helper to create a minimal skill definition for testing
function makeSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
	return {
		name: 'Test Skill',
		description: 'A test skill',
		triggers: ['test', 'run test'],
		body: 'Do something',
		source: 'builtin',
		sourceDirectory: '/fake',
		filePath: '/fake/SKILL.md',
		...overrides,
	};
}

describe('SkillManager.matchSkill', () => {
	let manager: SkillManager;

	beforeEach(() => {
		manager = new SkillManager('');
		// Inject skills directly via internal state for testing
		(manager as unknown as { skills: SkillDefinition[] }).skills = [
			makeSkill({
				name: 'Summarize',
				triggers: ['summarize', 'summarize this'],
				slashCommand: '/summarize',
			}),
			makeSkill({
				name: 'Research',
				triggers: ['research'],
				slashCommand: '/research',
			}),
		];
	});

	it('matches slash commands', () => {
		const result = manager.matchSkill('/summarize my note', []);
		expect(result).not.toBeNull();
		expect(result!.matchType).toBe('slash');
		expect(result!.skill.name).toBe('Summarize');
		expect(result!.cleanedPrompt).toBe('my note');
	});

	it('matches trigger words', () => {
		const result = manager.matchSkill('please summarize this document', []);
		expect(result).not.toBeNull();
		expect(result!.matchType).toBe('trigger');
		expect(result!.skill.name).toBe('Summarize');
	});

	it('respects disabled skills', () => {
		const result = manager.matchSkill('/summarize test', ['Summarize']);
		expect(result).toBeNull();
	});

	it('returns null for no match', () => {
		const result = manager.matchSkill('hello world', []);
		expect(result).toBeNull();
	});

	it('does not trigger on word boundaries (greedy match prevention)', () => {
		// "research" should not trigger on "don't research this" when the trigger is "search"
		(manager as unknown as { skills: SkillDefinition[] }).skills = [
			makeSkill({ name: 'Search', triggers: ['search'] }),
		];
		const result = manager.matchSkill("don't research this", []);
		// "research" contains "search" but should NOT match due to word boundary check
		expect(result).toBeNull();
	});

	it('does not trigger when preceded by negation', () => {
		const result = manager.matchSkill("don't summarize this", []);
		expect(result).toBeNull();
	});

	it('does not trigger with "do not" negation', () => {
		const result = manager.matchSkill("do not summarize this note", []);
		expect(result).toBeNull();
	});

	it('does not trigger with "never" negation', () => {
		const result = manager.matchSkill("never summarize my notes", []);
		expect(result).toBeNull();
	});

	it('does match when trigger appears as whole word', () => {
		(manager as unknown as { skills: SkillDefinition[] }).skills = [
			makeSkill({ name: 'Search', triggers: ['search'] }),
		];
		const result = manager.matchSkill('please search the vault', []);
		expect(result).not.toBeNull();
		expect(result!.skill.name).toBe('Search');
	});
});
