# Getting started

## Requirements

- Obsidian Desktop (plugin is desktop-only)
- GitHub Copilot access
- Copilot CLI installed and authenticated
- Node.js 18+ (for local development)

## Install Vilot manually

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release.
2. Create `<Vault>/.obsidian/plugins/vilot/`.
3. Copy the three files into that folder.
4. Open Obsidian and enable Vilot in **Settings → Community plugins**.

## First-run setup wizard

On first load, Vilot opens a setup wizard:

1. **CLI check**: verifies `copilot` connectivity.
2. **Auth check**: validates model access.
3. **Test message**: confirms end-to-end request/response.
4. **Done**: marks setup complete and opens chat.

If setup fails, open Obsidian developer tools and review plugin logs.

## Open chat

Use any of these:

- Ribbon icon: **Open vilot chat**
- Command: **Vilot: Open chat**
- Command: **Vilot: Ask about vault** (vault-focused prompt)

## Local development

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

## Validation commands

```bash
npm run lint
npm run build
npm run docs:build
```
