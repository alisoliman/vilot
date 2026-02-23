# Settings reference

This page describes Vilot settings, defaults, and runtime effects.

## General tab

### Copilot CLI status

Read-only status check showing whether Copilot is reachable.

### Conversations folder

- Key: `conversationsFolder`
- Default: `Vilot/Conversations`
- Purpose: storage location for saved chat transcripts

## Models tab

### Model visibility

- Key: `hiddenModels`
- Default: `[]`
- Purpose: hide specific models from chat dropdown without deleting support

### Active model

- Key: `model`
- Default: `claude-opus-4.6`
- Purpose: model used for chat and note actions

## Extensions tab

### External tool servers

- Key: `mcpServersJson`
- Default: `{}`
- Purpose: MCP server definitions used for additional tools
- Behavior: valid update triggers session reset

### Skill directories

- Key: `skillDirectories`
- Default: `[]`
- Purpose: extra folders to scan for `SKILL.md` skills
- Behavior: update triggers skill reload + session reset

### Install skill from URL

- Action: downloads remote `SKILL.md` into user skill folder
- Behavior: updates skill directories if needed and reloads skills

### Loaded skills toggles

- Key: `disabledSkills`
- Default: `[]`
- Purpose: disable specific skills by name

## Setup state

### Setup completion

- Key: `setupComplete`
- Default: `false`
- Purpose: controls first-run setup wizard display

## Internal persisted state

- `cliPath`: optional explicit CLI binary path
- `chatHistory`: in-memory/session chat cache for the view
