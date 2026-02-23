# Skills overview

A skill is a folder containing a `SKILL.md` file with frontmatter metadata and markdown instructions.

## Skill sources

Vilot loads skills from:

1. Built-in plugin skills under `skills/`
2. User skill directories from settings
3. Skills installed from GitHub URL into the user skills directory

## Matching behavior

Only one skill is active per message.

Priority order:

1. Slash command match (`/compose`, `/summarize`, ...)
2. Trigger keyword match from `triggers`

When matched, the skill instruction body is prepended for that request.

## Enable/disable behavior

In **Settings → Extensions → Loaded skills**, each skill has a toggle.

- Enabled: available to matching and slash autocomplete
- Disabled: excluded from matching and slash list

## Slash commands

Slash commands are not a separate registry.

- Skill manager is the source of truth
- Chat input `/` autocomplete reads loaded skills with `slashCommand`

## Install from URL

Use **Install skill from URL** with a GitHub `blob` or `raw` URL that points to `SKILL.md`.
