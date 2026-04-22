# Send2LLM — Claude Code Project Context

## Project

Cross-browser extension (Chrome, Firefox, Edge) + local MCP server that lets developers annotate live web pages and send rich context (screenshots, console logs, sessionStorage, recordings, structured notes) to any LLM coding agent without copy-paste.

GitHub: https://github.com/mbuon/Send2LLM

---

## Repo Structure

```
send2llm/
  extension/          ← Browser extension source (Vite + webextension-polyfill)
    src/
      background/     ← Service worker (MV3) / background page (MV2)
      content/        ← Content script, floating sidebar UI, element picker
      offscreen/      ← Canvas ops (screenshot stitching) + MediaRecorder
      popup/          ← Toolbar popup (on/off toggle only)
      platform/       ← Browser abstraction layer (chrome.* vs browser.*)
      shared/         ← Data models, utilities
    manifests/        ← manifest.chrome.json, manifest.firefox.json, manifest.edge.json
    vite.config.ts
  mcp-server/         ← Local MCP server (Node.js + SQLite)
    src/
      index.ts        ← Entry point, MCP tool definitions
      db.ts           ← SQLite access layer
      storage.ts      ← Filesystem ops (~/.send2llm/)
      tools/          ← One file per MCP tool
  docs/               ← Design specs and documentation
  docs/claude.ai/backups/  ← Backups of non-git files
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Extension build | Vite + TypeScript |
| Cross-browser API | `webextension-polyfill` |
| Screenshot stitching | OffscreenCanvas (MV3) / background page canvas (MV2) |
| Screen recording | `MediaRecorder` in offscreen document (Chrome/Edge) or background iframe (Firefox) |
| MCP server | Node.js + TypeScript |
| Session storage | SQLite (metadata) + filesystem (PNG/webm assets) |
| MCP protocol | `@modelcontextprotocol/sdk` |

---

## Browser Targets

| Browser | Manifest | Build target |
|---|---|---|
| Chrome | MV3 | `dist/chrome/` |
| Edge | MV3 | `dist/edge/` |
| Firefox | MV2 | `dist/firefox/` |

---

## MCP Server

- Default port: `3579`
- Sessions stored at: `~/.send2llm/`
- Extension POSTs to `http://localhost:3579/sessions` on "Send → MCP"
- MCP tools: `list_sessions`, `load_session`, `get_annotations`, `get_annotation`, `get_screenshot`, `get_console_logs`, `get_session_storage`, `get_recording`

---

## Key Design Decisions

- **No cloud, no external APIs** — everything runs locally
- **MCP server is the integration point** — not web UI injection (too brittle)
- **Offscreen document** required for MV3 canvas + MediaRecorder (service workers have no DOM)
- **Firefox uses MV2** — MV3 support in Firefox is not production-ready
- **Single source codebase** — build tool generates 3 separate dist packages
- **Hybrid storage** — SQLite for metadata/logs, filesystem for large binary assets (PNG, webm)
- **Console log capture** — injected at `document_start` to catch all logs from page load

---

## Docs

- Design spec: [docs/2026-04-22-send2llm-design.md](docs/2026-04-22-send2llm-design.md)
- MCP Server implementation plan: [docs/superpowers/plans/2026-04-22-mcp-server.md](docs/superpowers/plans/2026-04-22-mcp-server.md)
- Extension implementation plan: [docs/superpowers/plans/2026-04-22-extension.md](docs/superpowers/plans/2026-04-22-extension.md)
- Backups: [docs/claude.ai/backups/](docs/claude.ai/backups/)
