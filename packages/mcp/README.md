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
2. if `projectRoot` is provided, resolve its git root, then read only `<gitRoot>/.code-inspector/record.json`
3. match `projectRoot` against record keys with longest-prefix project-directory matching, then probe the matched project port first with `GET /context/selected`
4. if the matched port fails, continue probing the other ports from the same record file
5. if `projectRoot` is omitted, use the current workspace path to resolve the git root and do the same longest-prefix matching against the same record file
6. fallback `http://127.0.0.1:5678`

Strict rules:

- Only use the git root `.code-inspector/record.json`.
- Do not search the filesystem for other `.code-inspector` directories.
- Do not scan arbitrary common ports such as `3000`, `5173`, or `8080`.
- Do not choose a port before determining the matching project directory from the record keys.

`ensure_agents_rule` writes `AGENTS.md` in the provided `projectRoot`, or in the git project root when omitted.
