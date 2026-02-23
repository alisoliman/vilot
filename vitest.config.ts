import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const obsidianMockPath = fileURLToPath(new URL('./tests/__mocks__/obsidian.ts', import.meta.url));

export default defineConfig({
	test: {
		include: ['tests/**/*.test.ts'],
		alias: {
			obsidian: obsidianMockPath,
		},
	},
});
