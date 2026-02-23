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
Summarize the provided context in 3-5 sentences.

- If the user included @mentions (notes, folders, or tags), summarize those mentioned notes.
- If no @mentions are provided, summarize the active note.

- Focus on the main ideas, decisions, and outcomes.
- Keep concrete details that matter (dates, owners, metrics).
- Avoid filler, repetition, and meta commentary.
- If context is missing, ask one short clarifying question.
