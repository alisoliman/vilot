# Obsidian GitHub Copilot

Use **GitHub Copilot** directly in Obsidian. Chat with your notes, get AI-powered completions, and run agentic workflows — all powered by your existing GitHub Copilot subscription.

> ⚠️ **Work in progress** — not ready for use yet.

## What Makes This Different

Unlike other AI plugins for Obsidian that require separate API keys (OpenAI, Anthropic, etc.), this plugin uses the **official GitHub Copilot SDK**. If you already have a GitHub Copilot subscription (including the free tier), you can use AI in Obsidian with zero additional setup.

## Planned Features

- **Chat Panel** — Conversational AI in the Obsidian sidebar with full note context
- **Inline Completion** — Ghost text suggestions while you type (like VS Code)
- **Note Commands** — Summarize, generate tags, extract action items
- **Vault Context** — Reference multiple notes with `@` mentions
- **Agent Mode** — Let Copilot edit and organize your notes

## Requirements

- Obsidian Desktop (macOS or Windows)
- [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli) installed and authenticated
- GitHub Copilot subscription (free tier works)

## Architecture

Built on the official [`@github/copilot-sdk`](https://github.com/github/copilot-sdk) (TypeScript). The SDK communicates with the Copilot CLI in server mode via JSON-RPC, giving us access to the same agent runtime that powers Copilot CLI.

## Development

```bash
# Install dependencies
npm install

# Dev mode (watch)
npm run dev

# Production build
npm run build
```

## License

MIT
