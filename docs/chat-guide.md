# Chat guide

## Core behavior

- `Enter` sends the message
- `Shift+Enter` inserts a newline
- Responses stream incrementally
- Tool activity appears inline under each assistant message

## Context mentions

Use `@` mentions to attach vault context:

- `@NoteName` attaches one note
- `@folder/path/` attaches all markdown notes in that folder subtree
- `@#tag` attaches all notes containing that tag

Quoted mention syntax is supported for paths with spaces:

```text
@"Projects/Client A/"
```

## Mention autocomplete

Autocomplete appears while typing `@` and includes:

- `📄` note suggestions
- `📁` folder suggestions
- `🏷️` tag suggestions

Use arrow keys to navigate, `Enter` to accept, and `Esc` to dismiss.

## Slash commands

Slash commands are a UI layer on top of skills.

- Type `/` in the input
- Choose a skill command from the dropdown
- Selection inserts the command into the message

Example:

```text
/compose Rewrite the roadmap intro for clarity and consistency
```

## Conversation history

Vilot can save and load chat history notes in your configured conversations folder.
