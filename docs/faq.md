# FAQ and troubleshooting

## Copilot CLI is not connecting

Check:

1. `copilot` is installed and available
2. You completed `copilot auth login`
3. Vilot settings `cliPath` (if set) points to a valid binary

Then reload Obsidian.

## Why is a folder mention using too few notes?

Use explicit folder syntax with trailing slash, for example:

```text
@"Projects/Client A/"
```

Without trailing slash, the mention may be resolved as a note-style mention.

## I only see tool calls and no assistant message

If the model returns no textual answer, Vilot now shows a fallback message and keeps tool details visible.

## Slash commands do not appear

Check:

- Skill has a `slashCommand` in frontmatter
- Skill is enabled in **Settings → Extensions → Loaded skills**
- You typed `/` in chat input

## `propose_edit` works but apply fails

Apply can fail if file content changed after proposal generation.

Retry by asking composer to regenerate proposals from the current file state.

## Community plugin install issues

Confirm your release assets include:

- `main.js`
- `manifest.json`
- `styles.css` (if present)

Tag must exactly match `manifest.json` `version`.
