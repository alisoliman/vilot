# Vault tools

Vilot registers a constrained toolset for vault operations.

## Toolset

- `search_vault`
- `read_note`
- `list_notes`
- `get_note_metadata`
- `get_backlinks`
- `create_note`
- `propose_edit`
- `write_note`

## Safety model

- File resolution is markdown-only for note tools
- `propose_edit` never writes files
- `write_note` supports guarded modes (`append`, `patch`, `replace`)
- Composer workflow should prefer `propose_edit` first

## Recommended operating order

1. Discover (`search_vault`, `list_notes`)
2. Inspect (`read_note`, `get_note_metadata`, `get_backlinks`)
3. Propose (`propose_edit`)
4. Apply (`write_note` or accepted composer proposals)
