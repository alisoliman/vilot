import { defineConfig } from 'vitepress';
import { env } from 'node:process';

const docsBase = env.VILOT_DOCS_BASE ?? '/vilot/';

export default defineConfig({
	title: 'Vilot Docs',
	description: 'Production documentation for the Vilot Obsidian plugin',
	base: docsBase,
	themeConfig: {
		nav: [
			{ text: 'Docs', link: '/' },
			{ text: 'GitHub', link: 'https://github.com/alisoliman/vilot' },
		],
		sidebar: [
			{
				text: 'Introduction',
				items: [
					{ text: 'Home', link: '/' },
					{ text: 'Getting started', link: '/getting-started' },
					{ text: 'FAQ', link: '/faq' },
				],
			},
			{
				text: 'Core guides',
				items: [
					{ text: 'Chat guide', link: '/chat-guide' },
					{ text: 'Composer guide', link: '/composer' },
					{ text: 'Note actions', link: '/note-actions' },
					{ text: 'MCP servers', link: '/mcp-servers' },
				],
			},
			{
				text: 'Skills',
				items: [
					{ text: 'Skills overview', link: '/skills-overview' },
					{ text: 'Built-in skills', link: '/built-in-skills' },
					{ text: 'Creating custom skills', link: '/custom-skills' },
				],
			},
			{
				text: 'Reference',
				items: [
					{ text: 'Vault tools', link: '/vault-tools' },
					{ text: 'All tools reference', link: '/tools-reference' },
					{ text: 'Settings reference', link: '/settings-reference' },
				],
			},
		],
		socialLinks: [
			{ icon: 'github', link: 'https://github.com/alisoliman/vilot' },
		],
	},
});
