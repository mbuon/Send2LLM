# Send2LLM — by Massimo Buonaiuto

**Annotate any web page and send rich context to your AI coding agent — no copy-paste.**

Send2LLM is a cross-browser extension (Chrome, Firefox, Edge) paired with a local MCP server. Developers who use AI coding agents like Claude Code, Cursor, Codex, or ChatGPT can highlight elements on a live page, attach typed notes, capture full-page and element screenshots, console logs, sessionStorage, and multiple screen/audio recordings — then send everything to their LLM in one click. No cloud, no API keys, no manual copy-paste.

Built by **Massimo Buonaiuto**.

---

## How it works

```
You annotate the page in your browser
        ↓
Click "Send → MCP"
        ↓
Local MCP server stores the session
  - SQLite for metadata, console logs, annotations
  - Filesystem (~/.send2llm/sessions/<id>/) for PNGs and webm recordings
        ↓
Your coding agent (Claude Code / Cursor / Codex / any MCP client)
calls MCP tools to pull exactly the context it needs:
  list_sessions() → load_session(1) → get_annotation(1, 2)
                                   → transcribe_recording(1)
                                   → get_screenshot(1)
        ↓
Agent executes your instructions with full visual + audio context
```

Annotations are typed (`task` / `bug` / `comment` / `request`) so the agent can filter by intent. Recordings are saved as `.webm` on disk; the `transcribe_recording` tool runs `whisper.cpp` locally to produce text, because LLMs can't ingest webm directly. Everything lives on your machine.

---

## Features

- **Floating sidebar** — a draggable, collapsible widget injected into any page. Position is remembered, and the on/off state survives navigation, link clicks, and new tabs (synced via `chrome.storage.local`).
- **Element & region picks** — click any element to capture a tight crop with selector + xpath + outerHTML. Or drag a rectangle to capture an arbitrary region.
- **Four annotation types** — `task`, `bug`, `comment`, `request`. Type each draft separately, then "Add annotations" to commit all four at once.
- **Full-page screenshot** — opt-in checkbox. Scrolls the entire page, primes lazy-loaded content, freezes sticky headers and animations, then stitches into a single JPEG. The Send2LLM widget itself is hidden during capture so it never appears in the output.
- **Console log capture** — content script injects at `document_start` and records all `console.*` output from page load onward.
- **Screen / mic / tab-audio recording** — per-source toggles, MediaRecorder running in the offscreen document (Chrome/Edge) or background page (Firefox). Multiple recordings per session.
- **sessionStorage capture** — full key-value snapshot per send.
- **Local-only data** — sessions live in `~/.send2llm/`. SQLite for metadata + console logs, filesystem for binary assets (PNG, JPEG, webm).
- **MCP-native** — your AI agent reads the session through MCP tools, not via injected web UI. Survives page reloads, browser restarts, agent restarts.
- **Voice transcription** — `whisper.cpp` runs locally on the saved webm; no audio leaves the machine.
- **Cross-browser** — single TypeScript codebase, three manifest packages (Chrome MV3, Edge MV3, Firefox MV2).

---

## Requirements

| Tool | Required for | Auto-install |
|---|---|---|
| Node.js 18+ | Extension build + MCP server | Install from [nodejs.org](https://nodejs.org) |
| npm | Dependency management | Bundled with Node |
| ffmpeg | Normalizing recordings, extracting audio | Yes (Homebrew / apt / dnf) |
| whisper.cpp | Local audio transcription | macOS via Homebrew; Linux manual |
| Whisper model | Transcription weights (`ggml-base.en.bin`, ~141 MB) | Downloaded on first install |

`cd mcp-server && npm install` runs a `postinstall` script that installs missing ffmpeg / whisper.cpp on macOS (Homebrew) and common Linux distros (apt, dnf). On Windows or unsupported distros the check prints install hints and continues — the server still runs, but recordings won't be transcribed. Re-run the check anytime with `npm run check-deps`.

Browser extension has no system dependencies beyond a Chromium-based or Firefox browser.

---

## Installation

```bash
# Clone
git clone https://github.com/mbuon/Send2LLM.git
cd Send2LLM

# 1. Install extension + build (default target is Chrome)
cd extension
npm install
npm run build            # builds dist/chrome/ (default)
# Or build a specific browser target:
#   npm run build:chrome    → dist/chrome/    (Chrome MV3)
#   npm run build:edge      → dist/edge/      (Edge MV3)
#   npm run build:opera     → dist/opera/     (Opera, Chromium MV3)
#   npm run build:firefox   → dist/firefox/   (Firefox MV2)
#   npm run build:all       → all four at once

# 2. Install MCP server (auto-installs ffmpeg + whisper.cpp via Homebrew/apt)
cd ../mcp-server
npm install
npm run build

# 3. Download whisper model (one-time, ~141 MB)
mkdir -p ~/.send2llm/models
curl -L -o ~/.send2llm/models/ggml-base.en.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin

# 4. Start the MCP server
node dist/index.js
# Send2LLM HTTP server listening on port 3579
```

**Load the extension:**

| Browser | URL | Steps |
|---|---|---|
| **Chrome** | `chrome://extensions` | Enable *Developer mode* (top right) → *Load unpacked* → pick `extension/dist/chrome/`. |
| **Edge** | `edge://extensions` | Toggle *Developer mode* (left side) → *Load unpacked* → pick `extension/dist/edge/`. |
| **Opera** | `opera://extensions` | Toggle *Developer mode* (top right) → *Load unpacked* → pick `extension/dist/opera/`. (Opera ships with a separate "Install Chrome Extensions" extension that lets you also use Chrome Web Store builds, but the unpacked path is the recommended one.) |
| **Firefox** | `about:debugging#/runtime/this-firefox` | Click *Load Temporary Add-on* → pick `extension/dist/firefox/manifest.json`. Firefox erases temporary add-ons on restart; for permanent installs sign the build via [`web-ext`](https://addons.mozilla.org/en-US/developers/) and load it as an unpacked add-on at `about:addons`. |

> **Recording capabilities differ across browsers**:
> - Chrome / Edge / Opera support **screen + microphone + tab-audio** mixing in one recording. The "Before you record" dialog walks you through the OS share-picker for each.
> - Firefox supports **screen + microphone** but cannot capture tab audio (Chromium-only API). Audio-only recordings work fine; tab-audio toggles are no-ops.

**Wire the MCP server into your agent.** Example for Claude Code — add to `~/.claude/config.json`:

```json
{
  "mcpServers": {
    "send2llm": {
      "command": "node",
      "args": ["/absolute/path/to/Send2LLM/mcp-server/dist/index.js"]
    }
  }
}
```

Cursor, Codex, and other MCP clients take a similar config block; check each tool's docs for the exact file path.

---

## Example Prompts

After you annotate a page and click "Send → MCP", your agent can answer prompts like these. Send2LLM gives the agent the visual + textual context it needs to actually be useful.

1. **"Fix the bugs I flagged in my latest Send2LLM session."**
   Agent calls `list_sessions()` → `load_session(latest)` → reads each `type=bug` annotation with its screenshot and selector, then patches the code.

2. **"Implement every `task` annotation from session 3 as a separate commit."**
   Agent pulls all annotations, filters by type, and produces one commit per task with the annotation note as the commit message.

3. **"The button at annotation #2 doesn't match the design — restyle it."**
   Agent calls `get_annotation(session_id, 2)`, inspects the element screenshot + selector + outerHTML, and updates the matching CSS.

4. **"Read my voice recording and turn it into a tickets backlog."**
   Agent calls `transcribe_recording(session_id)`, parses the transcript into discrete items, creates tickets (or markdown list).

5. **"Summarize the console errors from my latest session and tell me the most likely root cause."**
   Agent pulls `get_console_logs(session_id)`, clusters by stack, correlates timestamps against annotations, and explains the failure.

6. **"Here are three annotations flagged as `request` — turn each into a GitHub issue with the screenshot attached."**
   Agent reads annotations, opens issues via `gh` CLI, embeds the screenshot paths from `get_annotation(...)`.

7. **"Compare annotation #1 and #4 — is it the same bug on two pages?"**
   Agent pulls both annotations, diffs selectors/notes/screenshots, reports whether they share a root cause.

8. **"Use my full-page screenshot from session 7 as a reference and rebuild this form in React."**
   Agent calls `get_screenshot(7)`, reads the PNG, and generates JSX that matches the visual layout.

9. **"From my recording, which steps led to the crash I annotated?"**
   Agent transcribes the recording, aligns steps with `type=bug` annotations, produces a reproduction checklist.

10. **"Delete annotation #3 from session 2 — I added it by mistake — and regenerate the markdown report."**
    Agent calls `delete_annotation(2, 3)` then `load_session(2)` to produce a fresh markdown summary.

---

## MCP Tools

| Tool | Description |
|---|---|
| `list_sessions()` | Numbered list of sessions (date, URL, annotation count) |
| `load_session(id)` | Full session object by number or ID |
| `get_annotations(session_id)` | All annotations in a session |
| `get_annotation(session_id, number)` | Single annotation with selector + screenshot path |
| `get_screenshot(session_id)` | Full-page screenshot file path |
| `get_console_logs(session_id)` | Console log snapshot |
| `get_session_storage(session_id)` | sessionStorage key-value pairs |
| `get_recording(session_id, index?)` | List recording file paths; optional 1-based index |
| `transcribe_recording(session_id, index?)` | Whisper transcript (all, or one by index) |
| `delete_annotation(session_id, number)` | Remove an annotation by number |

---

## Export Formats

| Format | Best for |
|---|---|
| **Markdown** | Paste directly into Claude.ai, ChatGPT, any web chat |
| **ZIP** | Attach files to Claude Code, Cursor, Codex CLI sessions |
| **JSON** | API workflows, custom integrations |

---

## Browsers

| Browser | Manifest | Recording | Notes |
|---|---|---|---|
| Chrome | MV3 | screen + mic + tab-audio | Primary target. |
| Edge | MV3 | screen + mic + tab-audio | Same code as Chrome; native MV3. |
| Opera | MV3 | screen + mic + tab-audio | Reuses the Chrome manifest (Chromium-based). |
| Firefox | MV2 | screen + mic only | No tab-audio API; UI hides the toggle. |

---

## Project Structure

```
Send2LLM/
  extension/          ← Browser extension (Vite + webextension-polyfill)
    src/
      background/     ← Service worker / background page
      content/        ← Content script, sidebar UI, element picker, recorder
      offscreen/      ← OffscreenCanvas + MediaRecorder host
      popup/          ← Toolbar popup
      platform/       ← chrome.* vs browser.* abstraction
      shared/         ← Data models and utilities
    manifests/        ← manifest.{chrome,firefox,edge}.json
  mcp-server/         ← Local MCP server (Node + SQLite + whisper.cpp)
    src/
      index.ts        ← MCP tool registry
      http.ts         ← POST /sessions ingestion
      db.ts           ← SQLite layer
      storage.ts      ← Filesystem layer
      tools/          ← One file per MCP tool
    scripts/          ← System-deps check + install
  docs/               ← Design specs and implementation plans
```

---

## Development

```bash
# Build specific extension target
npm run build:chrome
npm run build:firefox
npm run build:edge

# Dev-mode MCP server (tsx, no build step)
cd mcp-server && npm run dev

# Re-check system dependencies
cd mcp-server && npm run check-deps
```

---

## Troubleshooting

**Full-page capture stops short on long news / feed pages.**
The capture pipeline pre-scrolls the page once to wake lazy-loaders, then captures top-to-bottom. Pages with very aggressive infinite-scroll may exceed the 25-strip safety cap (≈25 viewports). If you need the entire page, scroll manually first so the content is loaded, then click Send.

**"This request exceeds the MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND quota."**
Chrome rate-limits `captureVisibleTab` to 2 calls/sec. The extension throttles itself to ≥550ms between calls and retries once on quota errors. If it still fires, wait a few seconds and click Send again — another extension on the same window may be racing for the quota.

**"Receiving end does not exist." on element pick.**
The offscreen document is created on demand; if it died (e.g. Chrome cleared it for memory) the next pick re-creates it transparently. Reload the tab if it persists.

**Sidebar appears in the full-page screenshot.**
Reload the extension at `chrome://extensions` to pick up the latest build. The sidebar is hidden via `display: none !important` during capture; if it's visible the build is stale.

**MCP server: "Cannot GET /health".**
The server has no `/health` endpoint by design — that response actually means it *is* listening. POST to `/sessions` is the only public route. Use the MCP tools from your agent for everything else.

---

## Contributing

Issues and PRs welcome at [github.com/mbuon/Send2LLM](https://github.com/mbuon/Send2LLM).

---

## Author

**Massimo Buonaiuto** — [github.com/mbuon](https://github.com/mbuon)

---

## License

MIT
