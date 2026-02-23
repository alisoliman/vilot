# Composer guide

Composer is Vilot's safe editing workflow for multi-note changes inside chat.

## Why composer

- The agent proposes edits without writing immediately
- You review a diff per file
- You choose what gets written

## Recommended flow

1. Run a composer request using `/compose`.
2. Let the agent call `propose_edit` one or more times.
3. Review generated unified diffs inline in chat.
4. Accept or reject per proposal.
5. Optionally use **Accept all** for batch apply.

## Edit proposal shape

```ts
interface EditProposal {
  path: string;
  description: string;
  originalContent: string;
  proposedContent: string;
  status: 'pending' | 'accepted' | 'rejected';
}
```

## Safety behavior

- Proposal application checks current file content before write
- If file changed since proposal generation, apply is skipped
- No write occurs for rejected proposals

## Apply code blocks to note

When an assistant code block looks like note content, Vilot shows **Apply to note**.

- It opens the existing diff modal
- You can review before committing the write
