# Obsidian GitHub Copilot Plugin — Research

## 🎯 Core Idea
An Obsidian community plugin that integrates **actual GitHub Copilot** (the product) into Obsidian Desktop. Users log in with their GitHub Copilot subscription and get AI-powered assistance for their notes — chat, completions, and agentic workflows — all powered by GitHub Copilot's models.

**Key differentiator:** This is NOT another OpenAI/Anthropic wrapper. It uses GitHub Copilot's official SDK and auth, meaning users with existing Copilot subscriptions (free tier included) can use it without any additional API keys or costs.

---

## 🏗️ Architecture Options

### Option A: Official Copilot SDK (Recommended) ⭐
- **Package:** `@github/copilot-sdk` on npm (TypeScript)
- **Status:** Technical Preview (MIT license)
- **How it works:** SDK spawns Copilot CLI in "server mode" → communicates via JSON-RPC
- **Auth:** Uses stored OAuth credentials from `copilot` CLI login (also supports BYOK)
- **Capabilities:**
  - Agent runtime with planning, tool invocation, file edits
  - All Copilot CLI models available
  - Custom agents, skills, and tools supported
  - Default: all first-party tools enabled (file system, git, web requests)
- **Pros:** Official, supported, full agent capabilities, clean API
- **Cons:** Requires Copilot CLI installed separately, technical preview (may break), premium request quota billing
- **Repo:** https://github.com/github/copilot-sdk
- **Cookbook:** https://github.com/github/awesome-copilot/blob/main/cookbook/copilot-sdk/nodejs/README.md

### Option B: copilot-api Reverse Proxy
- **Package:** `npx copilot-api`
- **How it works:** Reverse-engineered proxy that exposes GitHub Copilot as OpenAI-compatible API
- **Repo:** https://github.com/ericc-ch/copilot-api
- **Pros:** OpenAI-compatible = could work with existing Obsidian AI plugins
- **Cons:** Unofficial, reverse-engineered, may break, not supported by GitHub
- **Verdict:** Good for experimentation but risky for a community plugin

### Option C: Direct CLI Spawning
- **How it works:** Plugin spawns `copilot` CLI via Node.js `child_process`, parses output
- **Pros:** Simplest approach, no SDK dependency
- **Cons:** Fragile output parsing, limited capabilities vs SDK
- **Verdict:** Fallback option only

### Recommendation
**Go with Option A (Official SDK).** It's the sanctioned approach, has the most capabilities, and won't break when GitHub updates things. The SDK manages the CLI process lifecycle automatically.

---

## 🔍 Competitive Landscape

### Existing "Obsidian Copilot" (logancyang/obsidian-copilot)
- **NOT GitHub Copilot** — just named "Copilot"
- Generic LLM chat plugin supporting OpenAI, Anthropic, Google, Azure, local models
- Features: chat with notes, RAG, `@` context mentions, custom prompts
- Very popular (has its own website: obsidiancopilot.com)
- **Our differentiator:** Actual GitHub Copilot with its agent runtime, not just an LLM wrapper

### Smart Connections
- AI-powered note discovery and connections
- Vector embeddings for semantic search
- Different purpose — discovery, not chat/agent

### Note Companion
- Note organization, formatting, tagging via LLM
- Free with your own model key
- Simpler scope than what we're building

### Text Generator
- Autocomplete with various LLM backends
- Copilot-like inline completion interface
- Doesn't use GitHub Copilot specifically

### Key Gap We Fill
**No existing Obsidian plugin uses the official GitHub Copilot SDK.** All current AI plugins require users to bring their own API keys (OpenAI, Anthropic, etc.). Our plugin lets anyone with a GitHub Copilot subscription (including free tier) use AI in Obsidian with zero additional setup.

---

## 🔧 Technical Details

### Obsidian Plugin Architecture
- **Language:** TypeScript
- **Build:** esbuild (bundles to single `main.js`)
- **Template:** https://github.com/obsidianmd/obsidian-sample-plugin
- **Output files:** `manifest.json`, `main.js`, `styles.css`
- **Platform:** Electron (Desktop only) — gives us full Node.js access
- **Key APIs:** `Plugin`, `ItemView`, `Modal`, `Setting`, `MarkdownView`

### Node.js Access in Obsidian
- Obsidian Desktop runs on Electron → full Node.js APIs available
- `child_process` works for spawning processes
- Existing plugins like O-Terminal use `node-pty` for terminal embedding
- The Copilot SDK internally uses `child_process.spawn` to manage the CLI process
- **Important:** This is Desktop-only. Mobile Obsidian won't support this.

### Copilot SDK Integration Points
```typescript
import { CopilotClient } from '@github/copilot-sdk';

// Initialize — SDK auto-spawns Copilot CLI in server mode
const client = new CopilotClient();

// Create session with vault context
const session = await client.createSession({
  model: 'claude-sonnet-4', // or any available model
  // Auth: uses stored copilot CLI credentials automatically
});

// Send messages with note context
const response = await session.chat({
  messages: [
    { role: 'system', content: 'You are an AI assistant for Obsidian notes...' },
    { role: 'user', content: userMessage }
  ],
  // Can include file context from the vault
});
```

### Plugin UI Components
1. **Chat Panel** — Side panel (ItemView) for conversational interaction
2. **Inline Completion** — Autocomplete suggestions while typing (like VS Code)
3. **Command Palette Actions** — Summarize note, generate tags, ask questions
4. **Settings Tab** — Auth status, model selection, BYOK option

### Authentication Flow
1. User installs plugin → Settings show "Login with GitHub Copilot"
2. Plugin checks if `copilot` CLI is installed and authenticated
3. If not: guide user to install Copilot CLI and run `copilot auth login`
4. SDK uses stored OAuth credentials automatically
5. Alternative: BYOK mode (user provides own OpenAI/Azure/Anthropic key)

---

## 📋 Feature Ideas (MVP → Future)

### MVP (v0.1)
- [ ] Chat panel in Obsidian sidebar
- [ ] Send current note as context to Copilot
- [ ] Basic Q&A about note content
- [ ] Settings: auth status, model selection
- [ ] Command: "Ask Copilot about this note"

### v0.2
- [ ] `@` mentions to reference other notes as context
- [ ] Inline text completion (copilot-style ghost text)
- [ ] Note summarization command
- [ ] Tag/frontmatter generation

### v0.3
- [ ] Multi-note context (send multiple notes)
- [ ] Vault-wide search and Q&A (RAG-like)
- [ ] Custom agent instructions per vault
- [ ] Template generation from prompts

### Future
- [ ] Copilot agent with vault file editing capabilities
- [ ] Automated daily note generation
- [ ] Smart linking suggestions
- [ ] Meeting notes → action items extraction
- [ ] BYOK mode for users without Copilot subscription

---

## ⚠️ Risks & Considerations

### Community Plugin Approval
- Obsidian reviews all community plugins via PR to `obsidianmd/obsidian-releases`
- ObsidianReviewBot does automated checks
- **Concern:** Plugin requires external CLI binary (Copilot CLI). Need to verify this is allowed
- **Precedent:** O-Terminal plugin uses `node-pty` (native binaries), Terminal plugin spawns shells
- **Naming:** Can't use "Copilot" alone (conflicts with existing plugin). Consider: "GitHub Copilot for Obsidian", "Obsidian Copilot Agent", or something unique

### Copilot SDK Stability
- SDK is in Technical Preview — API may change
- We'd need to pin SDK version and handle breaking changes
- Monitor `github/copilot-sdk` releases closely

### Copilot CLI Dependency
- Users must install Copilot CLI separately
- Need clear setup instructions / first-run wizard
- Could potentially bundle or auto-install CLI

### Desktop Only
- This will NOT work on mobile Obsidian (no Node.js)
- Should clearly state "Desktop only" in plugin description
- Obsidian's plugin guidelines allow desktop-only plugins

### Rate Limits & Billing
- Copilot has premium request quotas
- Free tier: limited usage
- Need to show usage/quota info in plugin
- BYOK mode avoids this entirely

---

## 📚 References

- **Copilot SDK:** https://github.com/github/copilot-sdk
- **Copilot SDK npm:** https://www.npmjs.com/package/@github/copilot-sdk
- **SDK Cookbook:** https://github.com/github/awesome-copilot/blob/main/cookbook/copilot-sdk/nodejs/README.md
- **SDK Getting Started:** https://github.com/github/copilot-sdk/blob/main/docs/getting-started.md
- **SDK Auth Docs:** https://github.com/github/copilot-sdk/blob/main/docs/auth/index.md
- **BYOK Docs:** https://github.com/github/copilot-sdk/blob/main/docs/auth/byok.md
- **Obsidian Plugin Template:** https://github.com/obsidianmd/obsidian-sample-plugin
- **Obsidian Dev Docs:** https://docs.obsidian.md
- **Obsidian Plugin API (TypeScript):** https://github.com/obsidianmd/obsidian-api
- **Plugin Submission:** https://github.com/obsidianmd/obsidian-releases
- **copilot-api (reverse proxy):** https://github.com/ericc-ch/copilot-api
- **Existing Obsidian Copilot:** https://github.com/logancyang/obsidian-copilot
- **O-Terminal (node-pty in Obsidian):** https://github.com/Quorafind/O-Terminal
- **Awesome Obsidian AI Tools:** https://github.com/danielrosehill/Awesome-Obsidian-AI-Tools
- **InfoQ article on SDK:** https://www.infoq.com/news/2026/02/github-copilot-sdk/

---

*Research compiled Feb 20, 2026*
