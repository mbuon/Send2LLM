# Send2LLM — Design Spec
**Date:** 2026-04-22  
**Status:** Approved

---

## Overview

Send2LLM is a cross-browser extension (Chrome, Firefox, Edge) that lets developers annotate live web pages with structured notes, capture rich context (full-page screenshot, element screenshots, console logs, sessionStorage, screen recording), and deliver that context to any LLM tool (Claude Code, Codex, Cursor, ChatGPT, etc.) via an MCP server or exportable artifacts — without copy-paste.

The primary user is a developer using AI coding agents who needs to communicate precisely what to fix or build on a live page.

---

## Architecture

### Extension Components

| Component | Responsibility |
|---|---|
| **Content Script** (`content.js`) | Injected into every page. Handles element picking (hover + click), CSS highlight overlay, inline annotation popover, console log buffering (overrides `console.*` from early injection), sessionStorage snapshot at export time, floating sidebar UI, recording controls UI. |
| **Background Service Worker** (`background.js`) | Full-page scroll-and-stitch screenshot via `chrome.tabs.captureVisibleTab` loop. Coordinates export packaging. Receives recorded Blob from offscreen doc and stores temporarily. Manages communication between all contexts. |
| **Offscreen Document** (`offscreen.js`) | Hosts canvas operations (stitching screenshot strips, cropping element screenshots from full-page). Hosts `MediaRecorder` for screen/audio recording (MV3 service workers have no DOM access). |
| **Popup** (`popup.html`) | Minimal toolbar button. On/off toggle to activate annotation mode on current tab. No annotation logic. |

### Cross-Browser Strategy

Single repository, single source codebase. Build tool: **Vite** with `webextension-polyfill` to normalize `browser.*` vs `chrome.*` API differences.

Three build targets producing three separate dist packages:
- `dist/chrome/` — Manifest V3, service worker, offscreen document
- `dist/firefox/` — Manifest V2, persistent background page, no offscreen document (canvas ops run in background page directly). `MediaRecorder` also runs in background page via a hidden iframe with DOM access.
- `dist/edge/` — Manifest V3, identical to Chrome build

Per-browser differences handled via build-time config files (`manifest.chrome.json`, `manifest.firefox.json`, `manifest.edge.json`) and a thin adapter layer (`src/platform/`).

### MCP Server

A local Node.js process running on `localhost:3579` (configurable in extension options), configured once in the user's MCP client settings (e.g. `~/.claude/config`). Acts as the bridge between the extension and any MCP-compatible LLM tool.

When the user clicks **Send→MCP** in the sidebar, the content script sends the full `Session` object to the background, which POSTs it as JSON to `http://localhost:3579/sessions`. The MCP server receives it, writes metadata to SQLite, saves assets to `~/.send2llm/sessions/{id}/`, and confirms. The session is then immediately available via MCP tools.

**MCP Tools exposed:**

```
list_sessions()                    → numbered list (date, URL, annotation count)
load_session(id | number)          → full session object
get_annotations(session_id)        → all annotations in a session
get_annotation(session_id, n)      → single annotation by number, includes screenshot path
get_screenshot(session_id)         → full-page screenshot (file path or base64)
get_console_logs(session_id)       → console log snapshot
get_session_storage(session_id)    → sessionStorage key-value snapshot
get_recording(session_id)          → recording file path
```

**Example Claude Code interaction:**
```
> list_sessions()
1. 2026-04-22 14:30 — https://myapp.com/login (3 annotations)
2. 2026-04-22 11:15 — https://myapp.com/dashboard (5 annotations)

> load_session(1)
[full context loaded]

> get_annotation(1, 2)
[annotation #2 with element screenshot]
```

### Storage

Hybrid filesystem + SQLite:

```
~/.send2llm/
  sessions.db          ← SQLite: metadata, annotations, console logs, sessionStorage
  sessions/
    {session-id}/
      full-page.png    ← scroll-stitched full-page screenshot
      element-1.png    ← per-annotation element screenshot (cropped)
      element-2.png
      recording.webm   ← screen/audio recording (if captured)
```

SQLite stores file paths to assets, not blobs. The MCP server resolves paths and base64-encodes on demand when tools are called.

---

## Data Model

```ts
interface Session {
  id: string                          // uuid
  url: string
  pageTitle: string
  capturedAt: string                  // ISO timestamp (at export time)
  fullPageScreenshotPath: string      // path to full-page.png
  annotations: Annotation[]
  consoleLogs: ConsoleEntry[]
  sessionStorage: Record<string, string>
  recording?: RecordingMeta
}

interface Annotation {
  id: string                          // uuid
  number: number                      // 1-based display index
  type: 'task' | 'bug' | 'comment' | 'request'
  note: string                        // free-form text
  selector: string                    // CSS selector to element
  elementHTML: string                 // outerHTML snapshot
  elementScreenshotPath: string       // path to element-N.png
  boundingBox: { x: number; y: number; width: number; height: number }
  createdAt: string                   // ISO timestamp
}

interface ConsoleEntry {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug'
  message: string
  timestamp: string
}

interface RecordingMeta {
  filename: string                    // e.g. "recording.webm"
  path: string                        // absolute path
  sources: ('screen' | 'microphone' | 'tab-audio')[]
  durationMs: number
}
```

---

## Export Formats

All three formats are derived from the same `Session` object at export time (when user clicks Send/Export).

### JSON
Raw session object, pretty-printed. Ideal for API workflows.

### Markdown
Structured for direct paste into any LLM chat. Full-page screenshot and element screenshots embedded as base64 inline images. Suitable for Claude.ai web, ChatGPT, etc.

```markdown
# Send2LLM Report
URL: https://myapp.com/login
Captured: 2026-04-22T14:30:00Z

## Full Page Screenshot
![Full Page](data:image/png;base64,...)

## Console Logs
[error] 14:30:01 — Uncaught TypeError: Cannot read property 'click' of null

## Session Storage
token: abc123
theme: dark

## Annotations

### [TASK] #1 — Fix the broken login button
Selector: button#login-btn
![Element](data:image/png;base64,...)
> Fix the click handler, it throws on empty password field

## Recording
recording.webm (attached separately — 00:42 duration)
```

### ZIP
```
send2llm-export/
  report.md
  report.json
  screenshots/
    full-page.png
    element-1.png
    element-2.png
  recording.webm
```

---

## UI Design

### Floating Sidebar (injected into page)

Three modes:

**Idle** — collapsed tab on right edge, shows annotation count badge.

**Annotation Mode** — sidebar expanded:
```
┌─────────────────────────┐
│ ● Send2LLM        [−][x]│
├─────────────────────────┤
│ [Pick Element]  [Record]│
├─────────────────────────┤
│ Annotations (2)         │
│ ① [TASK] Login button   │
│ ② [BUG]  Header overlap │
├─────────────────────────┤
│ [Export ▾]  [Send→MCP]  │
└─────────────────────────┘
```

Export dropdown options: Copy Markdown / Download ZIP / Download JSON / Send to MCP.

**Inline annotation popover** (appears on clicked element):
```
┌──────────────────────────────────────┐
│ Type: [Task][Bug][Comment][Request]  │
│ Note: _______________________________ │
│       _______________________________ │
│                    [Add] [Cancel]    │
└──────────────────────────────────────┘
```

**Recording Mode** — sidebar collapses to recording bar:
```
┌─────────────────────────────────────┐
│ ● REC  00:42                 [Stop] │
│ [✓ Screen]  [✓ Microphone]  [○ Tab] │
└─────────────────────────────────────┘
```
Source checkboxes are set before starting. Audio sources: Screen audio (tab audio), Microphone, or both. User chooses at record time.

---

## Console Log Capture

Content script overrides `console.log`, `console.warn`, `console.error`, `console.info`, `console.debug` on page load (injected as early as possible via `run_at: document_start`). Entries buffered in memory. Snapshot taken at export time — captures everything accumulated from page load to export click.

---

## Screenshot Capture

Full-page scroll-and-stitch:
1. Background service worker records current scroll position
2. Scrolls to top, captures viewport via `chrome.tabs.captureVisibleTab`
3. Scrolls by viewport height, captures again — repeats until page bottom
4. Sends all strips to offscreen document
5. Offscreen document stitches strips onto a single canvas, exports as PNG base64
6. Restores original scroll position

Element screenshots are cropped from the full-page PNG using the annotation's `boundingBox`.

---

## Project Structure

```
send2llm/
  extension/
    src/
      background/        ← service worker (MV3) / background page (MV2)
      content/           ← content script + sidebar UI
      offscreen/         ← canvas ops + MediaRecorder
      popup/             ← toolbar popup
      platform/          ← browser abstraction layer
      shared/            ← data models, utilities
    manifests/
      manifest.chrome.json
      manifest.firefox.json
      manifest.edge.json
    vite.config.ts
  mcp-server/
    src/
      index.ts           ← MCP server entry, tool definitions
      db.ts              ← SQLite access layer
      storage.ts         ← filesystem ops
      tools/             ← one file per MCP tool
    package.json
  docs/
    superpowers/specs/
      2026-04-22-send2llm-design.md
```

---

## Out of Scope (v1)

- Web UI injection (auto-filling LLM chat textareas) — too brittle
- Cloud sync / multi-device session sharing
- Team/collaborative annotations
- Browser history or network request capture
- Automatic LLM response handling
