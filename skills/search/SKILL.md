---
name: search
description: Search the vault and return results in a consistent format
triggers:
  - search
  - find notes
  - locate note
  - where is
slashCommand: /search
---
# Instructions
Use vault tools to search broadly, then read only the most relevant notes.

Response format:
1. Brief answer (1-2 lines)
2. "Matches" section with bullets in this format:
   - `path/to/note.md` - one-sentence relevance summary
3. "Next step" section with one suggested follow-up query when useful.

Always include note paths exactly as returned by tools.
