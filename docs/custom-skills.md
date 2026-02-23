# Creating custom skills

Custom skills let you encode repeatable workflows and prompt instructions.

## Minimal `SKILL.md`

```md
---
name: summarize
description: Summarize the active note concisely
triggers:
  - summarize
  - summary
  - tldr
slashCommand: /summarize
---
# Instructions
Summarize the note in 3-5 sentences...
```

## Frontmatter fields

- `name` (required): stable skill identifier
- `description` (required): short user-facing description
- `triggers` (optional): keyword list for automatic matching
- `slashCommand` (optional): command shown in `/` autocomplete

## Body

The markdown body is the instruction payload injected for the matched request.

## Install options

1. Add folder path to **Settings → Extensions → Skill directories**
2. Or use **Install skill from URL** for GitHub-hosted `SKILL.md`

## Authoring guidance

- Keep instructions specific and testable
- Prefer explicit output formats
- Use one skill per clear job
- Avoid overlapping triggers between skills
