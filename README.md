<h1 align="center">
  <!-- TODO: Add logo image here -->
  <!-- <img src="docs/assets/logo.png" alt="Vilot" width="120"/> -->
  <br>
  Vilot
</h1>

<h3 align="center">Your vault-aware AI assistant for Obsidian</h3>

<p align="center">
  Chat, edit, and organize your notes with an AI that actually understands your vault.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.1.0-blue?style=flat-square" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/Obsidian-1.4.0+-purple?style=flat-square&logo=obsidian" alt="Obsidian">
  <img src="https://img.shields.io/badge/desktop-only-orange?style=flat-square" alt="Desktop Only">
</p>

<p align="center">
  <a href="https://alisoliman.github.io/vilot/">Documentation</a> ·
  <a href="https://github.com/alisoliman/vilot/issues/new">Report Bug</a> ·
  <a href="https://github.com/alisoliman/vilot/issues/new">Request Feature</a>
</p>

---

## What is Vilot?

Vilot is an AI assistant that lives inside Obsidian and **actually knows your vault**. It can search your notes, suggest edits, generate tags, summarize content, and hold conversations grounded in what you've already written — powered by the [GitHub Copilot SDK](https://github.com/github/copilot-sdk).

> Think of it as intelligence for your second brain, not autocomplete.

<!-- TODO: Add hero screenshot/GIF of chat panel in action -->

---

## ✨ Features

| | Feature | What it does |
|---|---------|-------------|
| 💬 | **Chat with your vault** | Ask questions, get answers grounded in your notes |
| 📝 | **Note actions** | Summarize, generate tags, extract tasks — one command |
| 🎨 | **Composer** | AI proposes edits, you review diffs before applying |
| 🧩 | **Skills** | Extensible slash commands — built-in + your own |
| 🔌 | **MCP servers** | Connect external tools (web search, APIs, and more) |
| 🔍 | **Vault tools** | Search, read, create, and modify notes via AI |
| ⌨️ | **Keyboard-first** | Fast shortcuts for everything |

---

## 🚀 Quick Start

1. **Install** — Download from [Releases](https://github.com/alisoliman/vilot/releases) or search for **Vilot** in Community plugins *(coming soon)*.
2. **Enable** — Go to **Settings → Community plugins** and enable Vilot.
3. **Setup wizard** — Vilot walks you through connecting to GitHub Copilot on first launch.
4. **Start chatting** — Open the Vilot panel and ask your vault anything.

That's it. The setup wizard handles connectivity, authentication, and a test message for you.

---

## 💬 Chat with Your Vault

Open the Vilot sidebar and start a conversation. Use **`@` mentions** to pull in context:

- `@Note Name` — reference a specific note
- `@folder/path/` — include an entire folder
- `@#tag` — pull in all notes with a tag

Vilot searches, reads, and reasons over your notes to give you grounded answers — not hallucinations.

<!-- TODO: Add screenshot of chat with @mentions -->

---

## 📝 Note Actions

Run these from the **Command Palette** (`Cmd/Ctrl + P`) on any active note:

- **Summarize note** — get a concise summary
- **Generate tags** — auto-suggest relevant tags
- **Extract action items** — pull out tasks and to-dos
- **Update frontmatter** — enrich metadata automatically
- **Generate new note** — create a note from a prompt

Every change shows a **diff preview** before it touches your note. You're always in control.

---

## 🎨 Composer

Need multi-note edits? Use the `/compose` skill:

1. Describe what you want changed
2. Vilot proposes edits as **inline diffs**
3. **Accept** or **Reject** each change — per file or in bulk

You can also click **Apply to note** on any AI response code block to open a diff preview.

<!-- TODO: Add screenshot of composer diff view -->

---

## 🧩 Skills

Skills are slash commands that give Vilot specialized abilities. Type `/` in chat to see them.

**Built-in skills:** `/compose`, `/summarize`, `/tags`, `/tasks`, `/explain`, `/frontmatter`, `/links`, `/search`, `/weekly-review`

**Custom skills:**
- Built on the open-source [AgentSkills](https://skills.sh) format
- Add your own skill directories in settings
- Install skills from a GitHub URL
- Enable or disable skills per vault

---

## 🔌 MCP Servers

Extend Vilot with external tools via [MCP servers](https://modelcontextprotocol.io/). Configure them in **Settings → Extensions**:

```json
{
  "web-search": {
    "command": "npx",
    "args": ["-y", "@mcp/web-search"],
    "tools": ["*"]
  }
}
```

---

## ⌨️ Keyboard Shortcuts

| Action | Default shortcut |
|--------|-----------------|
| Open Vilot panel | Set in Obsidian hotkeys |
| Toggle chat | Set in Obsidian hotkeys |
| Note actions | `Cmd/Ctrl + P` → search "Vilot" |
| Skills in chat | Type `/` |
| Context mentions | Type `@` |

Customize all shortcuts in **Settings → Hotkeys** → search "Vilot".

---

## 🔧 Settings

Configure Vilot in **Settings → Vilot**:

- **Model selection** — choose your preferred Copilot model
- **Skills** — manage built-in and custom skills
- **MCP servers** — add external tool integrations
- **Privacy** — control what context is sent

For detailed settings docs, see the [full documentation](https://alisoliman.github.io/vilot/).

---

## 🔒 Privacy

- All requests go through **GitHub Copilot APIs** — no third-party services
- Note content is only sent when needed for your prompts
- MCP servers run **locally** unless you configure otherwise
- **Desktop only** — your vault stays on your machine

---

## 📖 Documentation

Full docs including guides, reference, and examples:

**[alisoliman.github.io/vilot](https://alisoliman.github.io/vilot/)**

---

## 🤝 Contributing

Contributions are welcome! Whether it's a bug report, feature idea, or pull request — we'd love your help.

```bash
git clone https://github.com/alisoliman/vilot.git
cd vilot
npm install
npm run dev
```

See the [documentation](https://alisoliman.github.io/vilot/) for architecture details and development guides.

---

## 📄 License

[MIT](LICENSE) — built by [Ali Soliman](https://github.com/alisoliman).
