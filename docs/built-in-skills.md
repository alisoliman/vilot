# Built-in skills

Vilot ships with these built-in skills.

## Content and organization

Built-ins live under `skills/<skill-name>/SKILL.md`.

## Included skills

- `summarize` (`/summarize`): concise summary of active note/context
- `search` (`/search`): vault search workflow with structured output
- `tags` (`/tags`): suggest useful tags for notes
- `tasks` (`/tasks`): extract and aggregate action items
- `explain` (`/explain`): explain content in simpler language
- `links` (`/links`): analyze backlinks and conceptual connections
- `frontmatter` (`/frontmatter`): generate or update frontmatter fields
- `weekly-review` (`/weekly-review`): aggregate daily notes into weekly review
- `compose` (`/compose`): instruct agent to propose edits with `propose_edit`

## Notes

- Exact trigger and prompt behavior comes from each `SKILL.md`
- You can disable any built-in skill from settings
