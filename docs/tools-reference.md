# All tools reference

This page describes every vault tool exposed by Vilot.

## `search_vault`

Search note content across markdown files.

### Params

- `query: string` (required)
- `limit: number` (optional, default `10`)

### Example

```json
{ "query": "weekly review", "limit": 8 }
```

## `read_note`

Read full note content by path.

### Params

- `path: string` (required)

### Example

```json
{ "path": "Projects/Roadmap.md" }
```

## `list_notes`

List notes, optionally filtered by folder or tag.

### Params

- `folder: string` (optional)
- `tag: string` (optional, accepts `project` or `#project`)

### Examples

```json
{ "folder": "Daily" }
```

```json
{ "tag": "#project" }
```

## `get_note_metadata`

Return frontmatter, tags, links, and headings.

### Params

- `path: string` (required)

### Example

```json
{ "path": "Knowledge/AI.md" }
```

## `get_backlinks`

List notes linking to a note.

### Params

- `path: string` (required)

### Example

```json
{ "path": "Knowledge/AI.md" }
```

## `create_note`

Create a new markdown file. Parent folders are created automatically.

### Params

- `path: string` (required)
- `content: string` (required)

### Example

```json
{ "path": "Drafts/New Idea.md", "content": "# New Idea" }
```

## `propose_edit`

Generate a structured search/replace proposal without writing.

### Params

- `path: string` (required)
- `description: string` (required)
- `search: string` (required, exact one-match target)
- `replace: string` (required)

### Example

```json
{
  "path": "Projects/Roadmap.md",
  "description": "Clarify Q2 priority",
  "search": "- Q2: Improve onboarding",
  "replace": "- Q2: Improve onboarding and activation"
}
```

## `write_note`

Modify an existing markdown note.

### Params

- `path: string` (required)
- `mode: string` (required, `append` | `patch` | `replace`)
- `content: string` (required)
- `find: string` (required for `patch`)

### Examples

Append:

```json
{ "path": "Projects/Roadmap.md", "mode": "append", "content": "\n## Risks\n- ..." }
```

Patch:

```json
{
  "path": "Projects/Roadmap.md",
  "mode": "patch",
  "find": "Current text",
  "content": "Replacement text"
}
```

Replace:

```json
{ "path": "Projects/Roadmap.md", "mode": "replace", "content": "# Rewritten" }
```
