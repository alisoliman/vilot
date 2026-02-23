# Note actions

Vilot provides command-palette actions for the active note.

## Available actions

- Summarize note
- Generate tags
- Extract action items
- Update frontmatter
- Generate new note from prompt
- Insert last response at cursor

## How writes are handled

- Actions that modify content go through a reviewable diff flow
- You approve changes before they are written to disk

## Best practice

Use note actions for single-note operations and use composer for multi-note edits.
