# Testing Guide — Vilot

## Prerequisites

1. **Obsidian Desktop** (macOS, Windows, or Linux)
2. **GitHub Copilot CLI** installed and authenticated:
   ```bash
   npm install -g @github/copilot
   copilot auth login
   copilot auth status
   ```
3. **Node.js 18+**

## Setup

### 1. Build the plugin
```bash
cd /path/to/vilot
npm install
npm run build
```

### 2. Symlink into your vault
```bash
mkdir -p "/path/to/your-vault/.obsidian/plugins/vilot"
ln -sf "$(pwd)/main.js" "/path/to/your-vault/.obsidian/plugins/vilot/main.js"
ln -sf "$(pwd)/manifest.json" "/path/to/your-vault/.obsidian/plugins/vilot/manifest.json"
ln -sf "$(pwd)/styles.css" "/path/to/your-vault/.obsidian/plugins/vilot/styles.css"
```

### 3. Enable in Obsidian
1. Open Obsidian → Settings → Community plugins
2. Disable restricted mode
3. Enable **Vilot**
4. Open console (`Cmd+Opt+I`) and verify no startup errors

### 4. Dev mode
```bash
npm run dev
```

## Test Plan

### First-run setup wizard

| # | Test | How | Expected |
|---|------|-----|----------|
| 1 | Wizard auto-opens | Fresh install with `setupComplete=false` | Setup wizard opens on plugin load |
| 2 | CLI check success | Step 1 → Check | Shows success when CLI reachable |
| 3 | CLI check failure | Break CLI path and run Step 1 | Shows failure and install instructions |
| 4 | Auth check success | Step 2 → Check | Lists models and passes |
| 5 | Auth check failure | Log out or force auth error | Shows login instructions |
| 6 | Test message | Step 3 → Check | Displays response preview and passes |
| 7 | Finish | Step 4 → Finish | `setupComplete=true`, wizard closes, chat view opens |

### Skills and slash commands

| # | Test | How | Expected |
|---|------|-----|----------|
| 8 | Built-in skills load | Open Settings → Extensions | Built-in skills list appears |
| 9 | Toggle skill disabled | Disable one skill | Skill no longer matches by trigger/slash |
| 10 | Slash autocomplete | Type `/` in chat | Dropdown lists slash-enabled skills |
| 11 | Slash selection | Select `/compose` | Command inserted in input |
| 12 | Trigger match | Message with skill trigger keyword | Matching skill instructions applied |
| 13 | Install skill from URL | Use Extensions install field | Skill downloaded, loaded, and appears in list |

### Enhanced `@` mentions

| # | Test | How | Expected |
|---|------|-----|----------|
| 14 | Note mention | Type `@NoteName` | Note suggestion (📄), context attached |
| 15 | Folder mention | Type `@Projects/` | Folder suggestions (📁), all folder notes attached |
| 16 | Tag mention | Type `@#project` | Tag suggestions (🏷️), tagged notes attached |
| 17 | Folder mention with spaces | Type `@Project Notes/` or `@"Project Notes/"` | All notes under that folder are attached |
| 18 | Mixed mentions dedupe | Use note + folder + tag with overlap | No duplicate context attachments |

### Composer and inline editing

| # | Test | How | Expected |
|---|------|-----|----------|
| 19 | `propose_edit` tool call | Use `/compose` request | Tool appears in transparency list |
| 20 | Inline diff card | Agent proposes edit | Path header + red/green diff rendered |
| 21 | Accept single proposal | Click Accept | File updated with stale-content guard |
| 22 | Reject single proposal | Click Reject | Status updates to rejected, no write |
| 23 | Multi-file proposals | Ask multi-note rewrite | Multiple cards with Accept all/Reject all |
| 24 | Apply to note button | Assistant returns note-like code block | `Apply to note` button opens DiffModal |

### Tool transparency

| # | Test | How | Expected |
|---|------|-----|----------|
| 25 | Grouped tool calls | Ask complex query | Shows grouped "Used N tools" block |
| 26 | Result summary | Expand tool details | Args + result summary visible |
| 27 | Timing info | Complete tool run | Duration shown in ms |
| 28 | Running animation | Observe tool start | Spinner shown then success/failure icon |

### Core chat + note actions

| # | Test | How | Expected |
|---|------|-----|----------|
| 29 | Streaming chat | Send message | Streaming response appears |
| 30 | Copy response | Click copy icon | Clipboard updated |
| 31 | New conversation | Click plus icon | Prior chat saved, new chat starts |
| 32 | Summarize note | Run command on note | Diff modal preview + safe apply |
| 33 | Generate tags | Run command on note | Frontmatter tags diff shown |
| 34 | Extract actions | Run command on note | Checklist section diff shown |
| 35 | Update frontmatter | Run command on note | Frontmatter update diff shown |

## Troubleshooting

- **Copilot CLI not found**: run `which copilot` and update settings
- **Auth errors**: run `copilot auth login`
- **No response**: inspect console logs for SDK/session errors
- **Tool failures**: verify note paths and metadata cache state
- **Stale apply failures**: re-run request to regenerate proposals on latest file content
