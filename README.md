# Send2LLM

**Annotate any web page and send rich context to your AI coding agent — no copy-paste.**

Send2LLM is a cross-browser extension (Chrome, Firefox, Edge) for developers who use AI coding agents like Claude Code, Codex, Cursor, or ChatGPT. Highlight elements on any live page, attach structured notes, capture screenshots, console logs, sessionStorage, and screen recordings — then send everything to your LLM in one click via a local MCP server.

---

## What it does

- **Highlight elements** on any page with a click
- **Annotate** with typed notes: Task, Bug, Comment, or Request
- **Capture full-page screenshots** (scroll-stitched) and element screenshots
- **Buffer console logs** from page load to export
- **Snapshot sessionStorage** at export time
- **Record screen + audio** (screen, microphone, tab audio — your choice)
- **Export** as Markdown, ZIP, or JSON
- **Send to MCP server** for zero-friction integration with Claude Code, Cursor, Codex, and any MCP-compatible client

---

## How it works

```
You annotate the page in your browser
        ↓
Click "Send → MCP"
        ↓
Local MCP server stores the session (SQLite + filesystem)
        ↓
Claude Code / Cursor / Codex calls MCP tools:
  list_sessions() → load_session(1) → get_annotation(1, 2)
        ↓
Agent executes your instructions with full visual context
```

No API keys required for the extension. No cloud. Everything stays local.

---

## MCP Tools

Once configured, your LLM agent has access to:

| Tool | Description |
|---|---|
| `list_sessions()` | Numbered list of past exports (date, URL, annotation count) |
| `load_session(n)` | Full session object by number or ID |
| `get_annotations(session_id)` | All annotations in a session |
| `get_annotation(session_id, n)` | Single annotation with element screenshot |
| `get_screenshot(session_id)` | Full-page screenshot |
| `get_console_logs(session_id)` | Console log snapshot |
| `get_session_storage(session_id)` | sessionStorage key-value pairs |
| `get_recording(session_id)` | Screen recording file path |

---

## Export Formats

| Format | Best for |
|---|---|
| **Markdown** | Paste directly into Claude.ai, ChatGPT, any web chat |
| **ZIP** | Attach files to Claude Code, Cursor, Codex CLI sessions |
| **JSON** | API workflows, custom integrations |

---

## Browsers

| Browser | Manifest | Status |
|---|---|---|
| Chrome | MV3 | Supported |
| Edge | MV3 | Supported |
| Firefox | MV2 | Supported |

---

## Project Structure

```
send2llm/
  extension/          ← Browser extension (Vite + webextension-polyfill)
  mcp-server/         ← Local MCP server (Node.js + SQLite)
  docs/               ← Design specs and documentation
```

---

## Development

```bash
# Install dependencies
npm install

# Build all three browser targets
npm run build

# Build specific target
npm run build:chrome
npm run build:firefox
npm run build:edge

# Start MCP server (default port 3579)
cd mcp-server && npm start
```

---

## MCP Server Setup

Add to your `~/.claude/config` (or equivalent for your MCP client):

```json
{
  "mcpServers": {
    "send2llm": {
      "command": "node",
      "args": ["/path/to/send2llm/mcp-server/dist/index.js"]
    }
  }
}
```

The extension sends sessions to `http://localhost:3579` by default. The port is configurable in extension options.

---

## Contributing

Issues and PRs welcome at [github.com/mbuon/Send2LLM](https://github.com/mbuon/Send2LLM).

---

## License

MIT
