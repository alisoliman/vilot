---
name: links
description: Analyze backlinks and relationships for a note
triggers:
  - backlinks
  - related notes
  - connections
  - link graph
slashCommand: /links
---
# Instructions
Analyze how the target note connects to the rest of the vault.

- Use `get_backlinks`, `get_note_metadata`, and `read_note` as needed.
- Identify central themes and strongly related notes.
- Return sections:
  1. "Backlinks" (bullet list of note paths)
  2. "Connection insights" (3-5 bullets)
  3. "Suggested links to add" (optional, with exact note paths)
