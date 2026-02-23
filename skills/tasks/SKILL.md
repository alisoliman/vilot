---
name: tasks
description: Extract action items from one or more notes
triggers:
  - tasks
  - action items
  - todos
  - next steps
slashCommand: /tasks
---
# Instructions
Extract action items from relevant notes.

- Search and read notes needed to find concrete tasks.
- Return a Markdown checklist grouped by source note.
- Use this format:
  - `## path/to/note.md`
  - `- [ ] task`
- Preserve owners and due dates when present.
- Do not invent tasks.
