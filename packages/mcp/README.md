# agent-eyes-mcp

MCP server for Agent Eyes. It exposes two tools:

- `get_selected_context`
  Reads `GET /context/selected` from the local Agent Eyes service.
- `ensure_agents_rule`
  Creates or updates `AGENTS.md` in the target project root with the Agent Eyes workflow rule.

## Install

```bash
pnpm add -D agent-eyes-mcp
```

## Configure MCP client

Example stdio config:

```json
{
  "mcpServers": {
    "agent-eyes": {
      "command": "npx",
      "args": ["agent-eyes-mcp"]
    }
  }
}
```

## Tool notes

`get_selected_context` auto-resolves base URL in this order:

1. `baseUrl` tool argument
2. `AGENT_EYES_BASE_URL` / `CODE_INSPECTOR_BASE_URL`
3. current project `.code-inspector/record.json` port
4. fallback `http://127.0.0.1:5678`

`ensure_agents_rule` writes `AGENTS.md` in the provided `projectRoot`, or in the current working directory when omitted.
