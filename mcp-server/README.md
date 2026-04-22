# Send2LLM MCP Server

Local MCP server that receives sessions from the Send2LLM browser extension and exposes them to AI coding agents.

## Install & Build

```bash
cd mcp-server && npm install && npm run build
```

## Configure in Claude Code

Add to `~/.claude/config.json`:

```json
{
  "mcpServers": {
    "send2llm": {
      "command": "node",
      "args": ["/absolute/path/to/send2llm/mcp-server/dist/index.js"]
    }
  }
}
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SEND2LLM_DIR` | `~/.send2llm` | Storage root for sessions.db and asset files |
| `SEND2LLM_PORT` | `3579` | HTTP port for extension POST /sessions |

## Available Tools

- `list_sessions()` — numbered list of sessions
- `load_session(id)` — full session by number or ID
- `get_annotations(session_id)` — all annotations
- `get_annotation(session_id, number)` — single annotation
- `get_screenshot(session_id)` — full-page screenshot path
- `get_console_logs(session_id)` — console log snapshot
- `get_session_storage(session_id)` — sessionStorage pairs
- `get_recording(session_id)` — recording file path
- `delete_annotation(session_id, number)` — delete annotation by number
