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

### Existing "GitHub Copilot" Plugin (Pierrad/obsidian-github-copilot) ⚠️
- **Already in the community plugins directory** — 416 stars, 173 commits
- Plugin ID: `github-copilot` (taken)
- **Architecture: Copilot LSP** (Language Server Protocol via `@pierrad/ts-lsp-client`)
- Same approach as VS Code's Copilot extension — editor completions protocol
- Features: inline suggestions + basic chat
- Requires Node.js 22+ binary path
- React-based chat UI (react-markdown, zustand)
- **Does NOT use the Copilot SDK** — no agent runtime, no custom tools, no vault awareness
- **Our differentiator:** SDK-powered agent with vault tools vs LSP-powered autocomplete

### Existing "Obsidian Copilot" (logancyang/obsidian-copilot)
- **NOT GitHub Copilot** — just named "Copilot"
- Generic LLM chat plugin supporting OpenAI, Anthropic, Google, Azure, local models
- Features: chat with notes, RAG via embeddings, `@` context mentions, custom prompts
- Very popular (has its own website: obsidiancopilot.com)
- **Our differentiator:** Agent with tool use vs RAG pipeline. Free with GitHub account vs BYOK.

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
**No existing Obsidian plugin uses the Copilot SDK's agent runtime with custom vault tools.** The existing GitHub Copilot plugin does LSP-based completions. Other AI plugins are BYOK wrappers. None give the agent autonomous access to search, read, and modify vault notes via tools. That's our lane.

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

## 🔎 Vault Search Strategy

### The Question
How does the agent search across potentially thousands of notes to find relevant context?

### Approach: Three Layers (No Embeddings Required for MVP)

**Layer 1 — Agent Tool Use (MVP)**
The Copilot SDK supports custom tools. We register vault-aware tools and let the agent autonomously decide what to search and read — the same pattern Copilot CLI uses to navigate codebases without pre-embedding anything.

Tools we expose:
| Tool | What it does | Obsidian API |
|------|-------------|--------------|
| `search_vault` | Full-text keyword search | `app.vault.search()` / `MetadataCache` |
| `read_note` | Read a specific note | `app.vault.cachedRead(file)` |
| `list_notes` | List notes by folder/tag | `app.vault.getMarkdownFiles()` |
| `get_note_metadata` | Frontmatter, tags, links | `app.metadataCache.getFileCache(file)` |
| `get_backlinks` | Notes linking to a given note | `app.metadataCache.resolvedLinks` |

Agent flow: search → pick promising notes → read them → reason → answer. Iterates if needed.

**Layer 2 — Obsidian Search API (v0.2)**
Obsidian's built-in search supports operators, tags, properties, regex. Exposing this gives the agent a more powerful retrieval tool. Users can also manually `@`-mention notes for explicit context.

**Layer 3 — Local Embeddings (v0.3+, optional)**
For large vaults (1000+ notes) where semantic similarity matters:
- `transformers.js` for in-process embedding (no external dependencies)
- Vectors stored locally in plugin data dir
- Incremental re-indexing via `vault.on('modify')` events
- Exposed as `semantic_search` tool alongside keyword tools
- **Opt-in via settings** — not required

### Why Not Embeddings from Day 1?
- Adds complexity (indexing, storage, model download)
- Agent tool use is sufficient for most vaults (sub-1000 notes)
- Keeps MVP simple and dependency-light
- Matches how Copilot CLI actually works (no pre-embedding of codebases)

### Reference: How Competitors Handle This
- **Obsidian Copilot (logancyang):** Uses embeddings + vector store for vault-wide RAG
- **Smart Connections:** Embeddings-first approach, focused on note discovery
- **VS Code Copilot:** File system tools + workspace search, no pre-embedding

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
