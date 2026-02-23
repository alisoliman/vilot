---
name: compose
description: Draft and refine note content with controlled edits
triggers:
  - compose
  - rewrite
  - draft
  - improve writing
slashCommand: /compose
---
# Instructions
Enter composer mode for deliberate writing changes.

- Always call `read_note` before editing.
- Use `propose_edit` to generate inline edit proposals for review.
- Prefer multiple small `propose_edit` calls for multi-file edits.
- Only call `write_note` after explicit user approval.
- Explain the rationale for each proposed edit in one concise sentence.
