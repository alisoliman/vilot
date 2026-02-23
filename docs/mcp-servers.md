# MCP servers

Vilot can use external MCP servers to extend available agent tools.

## Where to configure

Open **Settings → Vilot → Extensions → External tool servers** and provide JSON.

The format matches Copilot CLI `mcp-config.json` style.

## Example

```json
{
  "web-search": {
    "command": "npx",
    "args": ["-y", "@mcp/web-search"],
    "tools": ["*"]
  }
}
```

## Important behavior

- JSON is validated before save
- Session resets after valid update so tool set refreshes
- Invalid JSON is rejected with an inline error

## Security recommendations

- Use trusted MCP servers only
- Scope `tools` narrowly when possible
- Prefer local stdio servers for sensitive workflows
- Review what data each server may receive
