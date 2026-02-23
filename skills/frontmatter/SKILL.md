---
name: frontmatter
description: Generate or improve YAML frontmatter for a note
triggers:
  - frontmatter
  - metadata
  - yaml
  - note properties
slashCommand: /frontmatter
---
# Instructions
Produce high-quality YAML frontmatter for the note.

- Include `tags`, `description`, and `aliases` when useful.
- Keep values accurate to the note content.
- Return only YAML frontmatter wrapped in `---` delimiters.
- No commentary outside the YAML block.
