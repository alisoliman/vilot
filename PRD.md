# PRD — Vilot

> Minimalist product doc. Living document — update as we build.

---

## Problem

Obsidian has AI plugins for chat and inline completions, but none that act as an **agent for your vault** — one that can autonomously search, read, cross-reference, and modify your notes. The existing "GitHub Copilot" Obsidian plugin (Pierrad) gives you LSP-based autocomplete and basic chat, but it can't reason across your vault, chain tool calls, or take actions on your notes.

Meanwhile, GitHub's new Copilot SDK (`@github/copilot-sdk`) ships a full agent runtime with custom tools, planning, and streaming — and anyone with a Copilot subscription (including free tier) can use it.

## Solution

**Vilot** — an agentic AI assistant for Obsidian that understands your entire vault. Powered by the official Copilot SDK, it can search notes, follow links, read context, and modify files — all with user approval. No extra API keys needed.

### How We Differ from Existing Plugins

| | **Vilot** (ours) | **GitHub Copilot** (Pierrad) | **Obsidian Copilot** (Logan Yang) |
|---|---|---|---|
| **Architecture** | Copilot SDK (agent runtime) | Copilot LSP (editor protocol) | OpenAI/Anthropic API wrappers |
| **Vault awareness** | Agent searches/reads notes via tools | None — current file only | RAG via embeddings |
| **Tool use** | Custom tools (search, read, backlinks) | None | None |
| **Note modification** | Yes, with diff preview | None | None |
| **Auth** | GitHub account (free tier) | GitHub account | Bring your own API key |
| **Inline completions** | No (not our focus) | Yes (core feature) | No |

**Positioning:** They do completions. We do intelligence.

## Target User

- Obsidian Desktop users (macOS / Windows / Linux)
- Has a GitHub account (free Copilot tier is enough)
- Developers, researchers, knowledge workers who want an AI that *understands* their vault, not just autocompletes text

## Non-Goals (for now)

- Mobile support (impossible — needs Node.js)
- Inline completions (existing plugin does this well)
- Building our own LLM infrastructure
- Local/offline mode (Copilot requires internet)

---

## Architecture

```
┌─────────────────────────────────────────────┐
│                Obsidian Desktop              │
│                                             │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐ │
│  │Chat Panel│  │ Commands │  │ Settings  │ │
│  └────┬─────┘  └────┬─────┘  └─────┬─────┘ │
│       │              │              │       │
│  ┌────▼──────────────▼──────────────▼─────┐ │
│  │          Plugin Core (TypeScript)      │ │
│  │                                        │ │
│  │  ┌─────────────┐  ┌─────────────────┐  │ │
│  │  │ Vault Tools  │  │ Session Manager │  │ │
│  │  │ • search     │  │ • conversations │  │ │
│  │  │ • read note  │  │ • context       │  │ │
│  │  │ • list files │  │ • streaming     │  │ │
│  │  └──────┬──────┘  └────────┬────────┘  │ │
│  └─────────┼──────────────────┼───────────┘ │
│            │                  │             │
│  ┌─────────▼──────────────────▼───────────┐ │
│  │        @github/copilot-sdk             │ │
│  │        (JSON-RPC over stdio)           │ │
│  └────────────────┬───────────────────────┘ │
└───────────────────┼─────────────────────────┘
                    │
         ┌──────────▼──────────┐
         │   Copilot CLI       │
         │   (server mode)     │
         └──────────┬──────────┘
                    │
         ┌──────────▼──────────┐
         │  GitHub Copilot API │
         │  (cloud models)     │
         └─────────────────────┘
```

## Vault Search Strategy

Three-layer approach, shipped incrementally:

### Layer 1: Agent Tool Use (MVP)
The Copilot agent gets custom tools that hook into Obsidian's APIs. The agent *itself* decides what to search and read — just like Copilot navigates a codebase.

| Tool | Description | Obsidian API |
|------|-------------|--------------|
| `search_vault` | Full-text search across notes | `app.vault.search()` / `app.metadataCache` |
| `read_note` | Read a specific note's content | `app.vault.cachedRead(file)` |
| `list_notes` | List notes in a folder or by tag | `app.vault.getMarkdownFiles()` |
| `get_note_metadata` | Get frontmatter, tags, links | `app.metadataCache.getFileCache(file)` |
| `get_backlinks` | Find notes linking to a given note | `app.metadataCache.resolvedLinks` |

The agent autonomously chains these: search → read → reason → answer. No embeddings needed.

### Layer 2: Obsidian Search Integration (v0.2)
Expose Obsidian's built-in search engine (which supports operators, tags, properties, regex) as a more powerful tool. Users can also manually `@`-mention notes to add them as context.

### Layer 3: Optional Local Embeddings (v0.3+)
For large vaults (1000+ notes) where semantic search matters:
- Embed notes using `transformers.js` (runs in-process, no external deps)
- Store vectors in `.obsidian/plugins/obsidian-github-copilot/embeddings.json`
- Re-index incrementally via Obsidian's `vault.on('modify')` events
- Expose as `semantic_search` tool alongside keyword search
- **Fully optional** — users opt in via settings

---

## Milestones

### M0: Proof of Concept ✦ *target: 1 week*
**Goal:** Copilot SDK talking to Obsidian, one chat exchange working.

- [ ] Install `@github/copilot-sdk` in plugin
- [ ] Verify SDK can spawn Copilot CLI from within Obsidian's Electron process
- [ ] Send a single message, get a response, display in a Notice
- [ ] Confirm auth works (existing `copilot auth login` session)

**Ship criteria:** "Hello from Copilot" displayed inside Obsidian.

### M1: Chat Panel ✦ *target: 2 weeks*
**Goal:** Usable chat sidebar with current-note context.

- [ ] `ItemView` sidebar panel with message input + response display
- [ ] Streaming responses (show tokens as they arrive)
- [ ] Current active note automatically included as context
- [ ] Conversation history within session
- [ ] Command palette: "Open Copilot Chat"
- [ ] Settings tab: auth status, model picker
- [ ] Basic error handling (CLI not found, auth expired, rate limit)

**Ship criteria:** Can have a multi-turn conversation about the current note.

### M2: Vault Tools ✦ *target: 2 weeks*
**Goal:** Agent can search and navigate the vault autonomously.

- [ ] Register custom tools with Copilot SDK: `search_vault`, `read_note`, `list_notes`, `get_note_metadata`, `get_backlinks`
- [ ] Agent autonomously uses tools to answer vault-wide questions
- [ ] `@note-name` mentions in chat to explicitly include notes
- [ ] Show which notes the agent accessed (transparency)
- [ ] Command: "Ask Copilot about my vault"

**Ship criteria:** "What are my open tasks across all daily notes?" returns correct results.

### M3: Note Actions ✦ *target: 2 weeks*
**Goal:** Copilot can modify notes with user approval.

- [ ] Commands: Summarize note, Generate tags, Extract action items
- [ ] Diff preview before applying changes (modal with accept/reject)
- [ ] Insert Copilot response at cursor position
- [ ] Generate new note from prompt
- [ ] Frontmatter generation/update

**Ship criteria:** "Summarize this note" produces a summary, user clicks Apply, note is updated.

### M4: Polish & Community Release ✦ *target: 2 weeks*
**Goal:** Ready for community plugin submission.

- [ ] First-run setup wizard (check CLI, guide auth)
- [ ] Keyboard shortcuts (open chat, send message)
- [ ] Chat history persistence (save/load conversations)
- [ ] Styling that matches Obsidian themes (light/dark)
- [ ] README, screenshots, demo GIF
- [ ] Submit PR to `obsidianmd/obsidian-releases`

---

## Tech Stack

| Component | Choice | Why |
|-----------|--------|-----|
| Language | TypeScript | Obsidian plugin standard |
| AI Backend | `@github/copilot-sdk` | Official, agent runtime, zero-config auth |
| Build | esbuild | Obsidian template default |
| UI | Obsidian API (`ItemView`, `Modal`, `Setting`) | Native look & feel |
| Search (MVP) | Obsidian `MetadataCache` + `Vault` API | Zero infra, already indexed |
| Search (future) | `transformers.js` embeddings | Local, no API calls, optional |
| Storage | Plugin data dir (`.obsidian/plugins/`) | Obsidian convention |

## Key Decisions

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| SDK vs LSP vs proxy | Official SDK | Full agent runtime with custom tools. LSP only does completions. |
| Embeddings for search | No (MVP), Optional (later) | Agent tool use sufficient for most vaults. YAGNI. |
| Auth method | Copilot CLI stored credentials | Zero-friction for existing Copilot users |
| Desktop only | Yes | Node.js required for SDK. Obsidian allows this. |
| Inline completions | No | Existing plugin (Pierrad) does this well. We focus on vault agent. |

## Resolved Questions

### ✅ External CLI dependency — Allowed
The existing GitHub Copilot plugin already requires Node.js 22+ binary path and is approved in the community directory. Terminal plugins spawn shells. Obsidian submission rules just require `isDesktopOnly: true` and README disclosures for network use. **No blocker.**

### ✅ SDK bundling — Should work
The SDK is pure TypeScript/JS. esbuild bundles it fine. `child_process` and `electron` are already in esbuild's externals list for Obsidian plugins (provided by the Electron runtime). Standard pattern.

### ✅ Rate limits — Standard UX
Show auth status and catch rate limit errors in settings. Display remaining quota when available. If rate limited, show a clear message with a link to upgrade. BYOK mode as future escape hatch.

### ✅ Community plugin review — Clear precedent
Plugins requiring external binaries are approved (GitHub Copilot plugin, Terminal plugins, O-Terminal). We disclose network use and external CLI dependency in README. `isDesktopOnly: true` in manifest.

### ⚠️ Naming — Rebranded
`github-copilot` (plugin ID) and "GitHub Copilot" (display name) are both taken by Pierrad's plugin. GitHub also holds the `GITHUB COPILOT` trademark (registered 2022). Their brand page explicitly says: *"Do not use GitHub trademarks without permission"* and *"Do not imply affiliation."*

**Decision:** Rebrand to avoid conflicts. Use a unique name. README can factually state "Powered by the GitHub Copilot SDK" (nominative fair use — describing what the product integrates with).

**Name: Vilot** (plugin ID: `vilot`)

---

*Created Feb 20, 2026 · Last updated Feb 20, 2026*
