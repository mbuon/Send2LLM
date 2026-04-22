# Send2LLM Browser Extension — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cross-browser extension (Chrome/Edge MV3, Firefox MV2) that lets users highlight page elements, attach typed annotations, capture full-page screenshots, console logs, sessionStorage, and screen recordings, then export or send to the local MCP server.

**Architecture:** Content script manages the floating sidebar UI, element picker, and console log buffering. Background (service worker MV3 / background page MV2) handles scroll-and-stitch screenshots, export packaging, and POST to MCP. Offscreen document (MV3 only) runs canvas stitching and MediaRecorder. A thin platform/ adapter normalises browser.* vs chrome.* APIs. Vite builds 3 separate dist packages from one source.

**Tech Stack:** TypeScript, Vite, webextension-polyfill, jszip, vitest, @types/chrome

**Prerequisite:** MCP server plan (2026-04-22-mcp-server.md) should be complete before testing Send→MCP flow.

---

## File Map

| File | Responsibility |
|---|---|
| `extension/package.json` | Dependencies and Vite build scripts |
| `extension/tsconfig.json` | TypeScript config |
| `extension/vite.config.ts` | Multi-entry Vite config for background/content/offscreen/popup, 3 browser targets |
| `extension/manifests/manifest.chrome.json` | Chrome MV3 manifest |
| `extension/manifests/manifest.firefox.json` | Firefox MV2 manifest |
| `extension/manifests/manifest.edge.json` | Edge MV3 manifest (identical to Chrome) |
| `extension/src/shared/types.ts` | Session, Annotation, ConsoleEntry, RecordingMeta interfaces |
| `extension/src/shared/utils.ts` | generateId(), formatDate(), buildCssSelector() |
| `extension/src/platform/index.ts` | Re-exports the right adapter based on build target |
| `extension/src/platform/mv3.ts` | chrome.* API wrappers: sendMessage, captureVisibleTab, storage |
| `extension/src/platform/mv2.ts` | browser.* API wrappers (same interface as mv3.ts) |
| `extension/src/background/index.ts` | Message router: dispatches to screenshot/export/mcp handlers |
| `extension/src/background/screenshot.ts` | Scroll-and-stitch orchestrator: scrolls tab, calls captureVisibleTab, sends strips to offscreen |
| `extension/src/background/export.ts` | Builds Markdown string and ZIP blob from Session object |
| `extension/src/background/mcp.ts` | POSTs Session + base64 assets to localhost:3579/sessions |
| `extension/src/offscreen/index.ts` | Handles STITCH_SCREENSHOTS and START/STOP_RECORDING messages |
| `extension/src/offscreen/canvas.ts` | Stitches PNG strips into one tall canvas, crops element screenshots |
| `extension/src/offscreen/recorder.ts` | MediaRecorder lifecycle: start/stop, returns webm Blob as base64 |
| `extension/src/content/index.ts` | Entry: injects sidebar, runs console capture override |
| `extension/src/content/console-capture.ts` | Overrides console.* at document_start, buffers ConsoleEntry[] |
| `extension/src/content/element-picker.ts` | Hover highlight (CSS outline) + click to select element, builds CSS selector |
| `extension/src/content/screenshot-crop.ts` | Crops element bounding box from full-page PNG base64 |
| `extension/src/content/sidebar/sidebar.ts` | Mounts shadow DOM sidebar, manages idle/annotation/recording modes |
| `extension/src/content/sidebar/sidebar.css` | Sidebar styles (scoped inside shadow root) |
| `extension/src/content/sidebar/annotation-list.ts` | Renders annotation list items with delete button |
| `extension/src/content/sidebar/popover.ts` | Inline annotation form: type picker + textarea + Add/Cancel |
| `extension/src/content/sidebar/recorder-bar.ts` | Recording controls: source checkboxes, timer, start/stop |
| `extension/src/popup/popup.html` | Toolbar popup HTML |
| `extension/src/popup/popup.ts` | Toggle annotation mode on active tab |
| `extension/src/popup/popup.css` | Popup styles |
| `extension/tests/shared/utils.test.ts` | Tests for generateId, formatDate, buildCssSelector |
| `extension/tests/background/export.test.ts` | Tests for Markdown and ZIP export builders |
| `extension/tests/content/console-capture.test.ts` | Tests for console override and buffer |
| `extension/tests/content/element-picker.test.ts` | Tests for CSS selector builder |

---

### Task 1: Project scaffold

**Files:**
- Create: `extension/package.json`
- Create: `extension/tsconfig.json`

- [ ] **Step 1: Create extension/package.json**

```json
{
  "name": "send2llm-extension",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build",
    "build:chrome": "BROWSER=chrome vite build",
    "build:firefox": "BROWSER=firefox vite build",
    "build:edge": "BROWSER=edge vite build",
    "dev:chrome": "BROWSER=chrome vite build --watch",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "jszip": "^3.10.1",
    "webextension-polyfill": "^0.12.0"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.268",
    "@types/firefox-webext-browser": "^120.0.0",
    "@types/node": "^20.14.0",
    "@types/webextension-polyfill": "^0.10.7",
    "typescript": "^5.5.0",
    "vite": "^5.3.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create extension/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "lib": ["ES2022", "DOM"],
    "types": ["chrome"]
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Install dependencies**

```bash
cd extension && npm install
```

Expected: node_modules/ created, no errors.

- [ ] **Step 4: Commit**

```bash
git add extension/package.json extension/tsconfig.json
git commit -m "chore: scaffold extension project"
```

---

### Task 2: Shared types and utilities

**Files:**
- Create: `extension/src/shared/types.ts`
- Create: `extension/src/shared/utils.ts`
- Create: `extension/tests/shared/utils.test.ts`

- [ ] **Step 1: Write failing tests for utils**

```typescript
// extension/tests/shared/utils.test.ts
import { describe, it, expect } from 'vitest';
import { generateId, formatDate, buildCssSelector } from '../../src/shared/utils.js';

describe('generateId', () => {
  it('returns a non-empty string', () => {
    expect(typeof generateId()).toBe('string');
    expect(generateId().length).toBeGreaterThan(0);
  });
  it('returns unique values', () => {
    expect(generateId()).not.toBe(generateId());
  });
});

describe('formatDate', () => {
  it('formats an ISO string to readable date', () => {
    const result = formatDate('2026-04-22T14:30:00Z');
    expect(result).toContain('2026');
    expect(result).toContain('14:30');
  });
});

describe('buildCssSelector', () => {
  it('uses id if present', () => {
    const el = { id: 'login-btn', tagName: 'BUTTON', className: '', parentElement: null } as any;
    expect(buildCssSelector(el)).toBe('button#login-btn');
  });

  it('uses tag + nth-child when no id', () => {
    const parent = { children: [] as Element[] } as any;
    const el = { id: '', tagName: 'DIV', className: 'card', parentElement: parent } as any;
    parent.children = [el];
    const result = buildCssSelector(el);
    expect(result).toContain('div');
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd extension && npm test
```

Expected: FAIL — Cannot find module '../../src/shared/utils.js'

- [ ] **Step 3: Implement shared/types.ts**

```typescript
// extension/src/shared/types.ts
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Annotation {
  id: string;
  number: number;
  type: 'task' | 'bug' | 'comment' | 'request';
  note: string;
  selector: string;
  elementHTML: string;
  elementScreenshotBase64: string;
  elementScreenshotPath: string;
  boundingBox: BoundingBox;
  createdAt: string;
}

export interface ConsoleEntry {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  message: string;
  timestamp: string;
}

export interface RecordingMeta {
  filename: string;
  path: string;
  sources: ('screen' | 'microphone' | 'tab-audio')[];
  durationMs: number;
}

export interface Session {
  id: string;
  url: string;
  pageTitle: string;
  capturedAt: string;
  fullPageScreenshotBase64: string;
  fullPageScreenshotPath: string;
  annotations: Annotation[];
  consoleLogs: ConsoleEntry[];
  sessionStorage: Record<string, string>;
  recording?: RecordingMeta & { base64?: string };
}
```

- [ ] **Step 4: Implement shared/utils.ts**

```typescript
// extension/src/shared/utils.ts
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export function buildCssSelector(el: Element): string {
  if (el.id) return `${el.tagName.toLowerCase()}#${el.id}`;

  const classes = Array.from(el.classList).slice(0, 2).join('.');
  const tag = el.tagName.toLowerCase();
  const base = classes ? `${tag}.${classes}` : tag;

  if (!el.parentElement) return base;
  const siblings = Array.from(el.parentElement.children);
  const index = siblings.indexOf(el) + 1;
  return `${base}:nth-child(${index})`;
}
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
cd extension && npm test
```

Expected: All utils tests PASS.

- [ ] **Step 6: Commit**

```bash
git add extension/src/shared/ extension/tests/shared/
git commit -m "feat: shared types and utility functions"
```

---

### Task 3: Platform adapter (browser API abstraction)

**Files:**
- Create: `extension/src/platform/mv3.ts`
- Create: `extension/src/platform/mv2.ts`
- Create: `extension/src/platform/index.ts`

- [ ] **Step 1: Implement mv3.ts**

```typescript
// extension/src/platform/mv3.ts
export async function sendMessageToTab(tabId: number, message: unknown): Promise<unknown> {
  return chrome.tabs.sendMessage(tabId, message);
}

export async function captureVisibleTab(windowId: number): Promise<string> {
  return chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
}

export async function executeScript<T>(tabId: number, func: () => T): Promise<T> {
  const results = await chrome.scripting.executeScript({ target: { tabId }, func });
  return results[0].result as T;
}

export async function getStorage(keys: string[]): Promise<Record<string, unknown>> {
  return chrome.storage.local.get(keys);
}

export async function setStorage(items: Record<string, unknown>): Promise<void> {
  return chrome.storage.local.set(items);
}
```

- [ ] **Step 2: Implement mv2.ts**

```typescript
// extension/src/platform/mv2.ts
import browser from 'webextension-polyfill';

export async function sendMessageToTab(tabId: number, message: unknown): Promise<unknown> {
  return browser.tabs.sendMessage(tabId, message);
}

export async function captureVisibleTab(windowId: number): Promise<string> {
  return browser.tabs.captureVisibleTab(windowId, { format: 'png' }) as Promise<string>;
}

export async function executeScript<T>(tabId: number, func: () => T): Promise<T> {
  const results = await browser.tabs.executeScript(tabId, { code: `(${func.toString()})()` });
  return results[0] as T;
}

export async function getStorage(keys: string[]): Promise<Record<string, unknown>> {
  return browser.storage.local.get(keys) as Promise<Record<string, unknown>>;
}

export async function setStorage(items: Record<string, unknown>): Promise<void> {
  return browser.storage.local.set(items);
}
```

- [ ] **Step 3: Implement platform/index.ts**

```typescript
// extension/src/platform/index.ts
// BROWSER is injected by Vite at build time via define
declare const __BROWSER__: string;
export * from (__BROWSER__ === 'firefox' ? './mv2.js' : './mv3.js');
```

- [ ] **Step 4: Commit**

```bash
git add extension/src/platform/
git commit -m "feat: platform abstraction layer for MV2/MV3 APIs"
```

---

### Task 4: Console capture

**Files:**
- Create: `extension/src/content/console-capture.ts`
- Create: `extension/tests/content/console-capture.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// extension/tests/content/console-capture.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startConsoleCapture, getConsoleLogs, clearConsoleLogs } from '../../src/content/console-capture.js';

beforeEach(() => {
  clearConsoleLogs();
  startConsoleCapture();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('startConsoleCapture', () => {
  it('captures console.log entries', () => {
    console.log('hello world');
    const logs = getConsoleLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe('log');
    expect(logs[0].message).toContain('hello world');
    expect(logs[0].timestamp).toBeTruthy();
  });

  it('captures console.error entries', () => {
    console.error('something broke');
    const logs = getConsoleLogs();
    expect(logs.some((l) => l.level === 'error')).toBe(true);
  });

  it('does not double-capture on second call', () => {
    startConsoleCapture();
    console.log('once');
    expect(getConsoleLogs().filter((l) => l.message.includes('once'))).toHaveLength(1);
  });
});

describe('clearConsoleLogs', () => {
  it('empties the buffer', () => {
    console.log('test');
    clearConsoleLogs();
    expect(getConsoleLogs()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd extension && npm test
```

Expected: FAIL — Cannot find module

- [ ] **Step 3: Implement console-capture.ts**

```typescript
// extension/src/content/console-capture.ts
import type { ConsoleEntry } from '../shared/types.js';

const LEVELS = ['log', 'warn', 'error', 'info', 'debug'] as const;
type Level = typeof LEVELS[number];

let buffer: ConsoleEntry[] = [];
let installed = false;

export function startConsoleCapture(): void {
  if (installed) return;
  installed = true;

  for (const level of LEVELS) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      buffer.push({
        level,
        message: args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '),
        timestamp: new Date().toISOString(),
      });
      original(...args);
    };
  }
}

export function getConsoleLogs(): ConsoleEntry[] {
  return [...buffer];
}

export function clearConsoleLogs(): void {
  buffer = [];
  installed = false;
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd extension && npm test
```

Expected: All console-capture tests PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/src/content/console-capture.ts extension/tests/content/console-capture.test.ts
git commit -m "feat: console log capture with level buffering"
```

---

### Task 5: Element picker

**Files:**
- Create: `extension/src/content/element-picker.ts`
- Create: `extension/tests/content/element-picker.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// extension/tests/content/element-picker.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildCssSelector } from '../../src/shared/utils.js';

// element-picker uses DOM events; test the selector builder and bounding box logic only
describe('buildCssSelector via utils', () => {
  it('prefers id selector', () => {
    const el = { id: 'hero', tagName: 'SECTION', className: '', parentElement: null } as any;
    expect(buildCssSelector(el)).toBe('section#hero');
  });

  it('falls back to tag + class', () => {
    const parent = { children: [] as Element[] } as any;
    const el = { id: '', tagName: 'BUTTON', className: 'btn primary', parentElement: parent } as any;
    parent.children = [el];
    const result = buildCssSelector(el);
    expect(result).toContain('button');
    expect(result).toContain('btn');
  });
});
```

- [ ] **Step 2: Run tests — verify they pass immediately (pure logic, no DOM)**

```bash
cd extension && npm test
```

Expected: PASS (tests use already-tested utils).

- [ ] **Step 3: Implement element-picker.ts**

```typescript
// extension/src/content/element-picker.ts
import { buildCssSelector } from '../shared/utils.js';
import type { BoundingBox } from '../shared/types.js';

const HIGHLIGHT_CLASS = 's2l-highlight';

let active = false;
let onPick: ((el: Element) => void) | null = null;

function addHighlightStyles(): void {
  if (document.getElementById('s2l-highlight-styles')) return;
  const style = document.createElement('style');
  style.id = 's2l-highlight-styles';
  style.textContent = `.${HIGHLIGHT_CLASS} { outline: 3px solid #f97316 !important; outline-offset: 2px !important; cursor: crosshair !important; }`;
  document.head.appendChild(style);
}

function onMouseOver(e: MouseEvent): void {
  (e.target as Element).classList.add(HIGHLIGHT_CLASS);
}

function onMouseOut(e: MouseEvent): void {
  (e.target as Element).classList.remove(HIGHLIGHT_CLASS);
}

function onClick(e: MouseEvent): void {
  e.preventDefault();
  e.stopPropagation();
  const el = e.target as Element;
  el.classList.remove(HIGHLIGHT_CLASS);
  stopPicker();
  onPick?.(el);
}

export function startPicker(callback: (el: Element) => void): void {
  if (active) return;
  active = true;
  onPick = callback;
  addHighlightStyles();
  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('mouseout', onMouseOut, true);
  document.addEventListener('click', onClick, true);
}

export function stopPicker(): void {
  active = false;
  onPick = null;
  document.removeEventListener('mouseover', onMouseOver, true);
  document.removeEventListener('mouseout', onMouseOut, true);
  document.removeEventListener('click', onClick, true);
}

export function getElementInfo(el: Element): { selector: string; html: string; boundingBox: BoundingBox } {
  const rect = el.getBoundingClientRect();
  return {
    selector: buildCssSelector(el),
    html: (el as HTMLElement).outerHTML.slice(0, 2000),
    boundingBox: {
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height,
    },
  };
}
```

- [ ] **Step 4: Commit**

```bash
git add extension/src/content/element-picker.ts extension/tests/content/element-picker.test.ts
git commit -m "feat: element picker with hover highlight and selector builder"
```

---

### Task 6: Export builder (Markdown + ZIP)

**Files:**
- Create: `extension/src/background/export.ts`
- Create: `extension/tests/background/export.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// extension/tests/background/export.test.ts
import { describe, it, expect } from 'vitest';
import { buildMarkdown, buildZip } from '../../src/background/export.js';
import type { Session } from '../../src/shared/types.js';

function makeSession(): Session {
  return {
    id: 'sess-1',
    url: 'https://example.com',
    pageTitle: 'Example',
    capturedAt: '2026-04-22T10:00:00Z',
    fullPageScreenshotBase64: Buffer.from('fake-png').toString('base64'),
    fullPageScreenshotPath: '',
    annotations: [{
      id: 'a1', number: 1, type: 'task', note: 'Fix the button',
      selector: 'button#login', elementHTML: '<button/>',
      elementScreenshotBase64: Buffer.from('fake-elem').toString('base64'),
      elementScreenshotPath: '',
      boundingBox: { x: 0, y: 0, width: 10, height: 10 },
      createdAt: '2026-04-22T10:00:01Z',
    }],
    consoleLogs: [{ level: 'error', message: 'TypeError', timestamp: '2026-04-22T10:00:02Z' }],
    sessionStorage: { theme: 'dark' },
  };
}

describe('buildMarkdown', () => {
  it('includes URL and page title', () => {
    const md = buildMarkdown(makeSession());
    expect(md).toContain('https://example.com');
    expect(md).toContain('Example');
  });

  it('includes annotation note and type', () => {
    const md = buildMarkdown(makeSession());
    expect(md).toContain('TASK');
    expect(md).toContain('Fix the button');
  });

  it('includes console log', () => {
    const md = buildMarkdown(makeSession());
    expect(md).toContain('[error]');
    expect(md).toContain('TypeError');
  });

  it('includes sessionStorage', () => {
    const md = buildMarkdown(makeSession());
    expect(md).toContain('theme');
    expect(md).toContain('dark');
  });

  it('embeds full-page screenshot as base64 img', () => {
    const md = buildMarkdown(makeSession());
    expect(md).toContain('data:image/png;base64,');
  });
});

describe('buildZip', () => {
  it('returns a Blob', async () => {
    const blob = await buildZip(makeSession());
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd extension && npm test
```

Expected: FAIL — Cannot find module

- [ ] **Step 3: Implement export.ts**

```typescript
// extension/src/background/export.ts
import JSZip from 'jszip';
import type { Session } from '../shared/types.js';

export function buildMarkdown(session: Session): string {
  const lines: string[] = [
    `# Send2LLM Report`,
    `URL: ${session.url}`,
    `Page: ${session.pageTitle}`,
    `Captured: ${session.capturedAt}`,
    ``,
    `## Full Page Screenshot`,
    `![Full Page](data:image/png;base64,${session.fullPageScreenshotBase64})`,
    ``,
    `## Console Logs`,
    session.consoleLogs.length === 0
      ? '_No logs captured._'
      : session.consoleLogs.map((l) => `[${l.level}] ${l.timestamp} — ${l.message}`).join('\n'),
    ``,
    `## Session Storage`,
  ];

  const storageEntries = Object.entries(session.sessionStorage);
  if (storageEntries.length === 0) {
    lines.push('_Empty._');
  } else {
    storageEntries.forEach(([k, v]) => lines.push(`${k}: ${v}`));
  }

  lines.push(``, `## Annotations`);
  for (const ann of session.annotations) {
    lines.push(
      ``,
      `### [${ann.type.toUpperCase()}] #${ann.number}`,
      `Selector: \`${ann.selector}\``,
      `> ${ann.note}`,
      ``,
      `![Element #${ann.number}](data:image/png;base64,${ann.elementScreenshotBase64})`,
    );
  }

  if (session.recording) {
    lines.push(
      ``, `## Recording`,
      `File: ${session.recording.filename} (${Math.round(session.recording.durationMs / 1000)}s)`,
      `Sources: ${session.recording.sources.join(', ')}`,
      `_Attached as recording.webm in ZIP export._`,
    );
  }

  return lines.join('\n');
}

export async function buildZip(session: Session): Promise<Blob> {
  const zip = new JSZip();
  const md = buildMarkdown(session);

  // Strip base64 from markdown for ZIP version (images are separate files)
  const mdForZip = md.replace(/!\[.*?\]\(data:image\/png;base64,[^)]+\)/g, (match) => {
    const label = match.match(/!\[(.*?)\]/)?.[1] ?? 'image';
    return `![${label}](screenshots/${label.toLowerCase().replace(/\s+/g, '-')}.png)`;
  });

  zip.file('report.md', mdForZip);
  zip.file('report.json', JSON.stringify(session, null, 2));

  const screenshots = zip.folder('screenshots')!;
  if (session.fullPageScreenshotBase64) {
    screenshots.file('full-page.png', session.fullPageScreenshotBase64, { base64: true });
  }
  for (const ann of session.annotations) {
    if (ann.elementScreenshotBase64) {
      screenshots.file(`element-${ann.number}.png`, ann.elementScreenshotBase64, { base64: true });
    }
  }

  if (session.recording?.base64) {
    zip.file('recording.webm', session.recording.base64, { base64: true });
  }

  return zip.generateAsync({ type: 'blob' });
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd extension && npm test
```

Expected: All export tests PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/src/background/export.ts extension/tests/background/export.test.ts
git commit -m "feat: markdown and zip export builders"
```

---

### Task 7: MCP sender

**Files:**
- Create: `extension/src/background/mcp.ts`

- [ ] **Step 1: Implement mcp.ts**

```typescript
// extension/src/background/mcp.ts
import type { Session } from '../shared/types.js';

const DEFAULT_PORT = 3579;

export async function sendToMcp(session: Session, port = DEFAULT_PORT): Promise<void> {
  const elementScreenshots: Record<string, string> = {};
  for (const ann of session.annotations) {
    if (ann.elementScreenshotBase64) {
      elementScreenshots[ann.id] = ann.elementScreenshotBase64;
    }
  }

  const payload = {
    session: { ...session, fullPageScreenshotBase64: undefined, annotations: session.annotations.map((a) => ({ ...a, elementScreenshotBase64: undefined })) },
    fullPageScreenshotBase64: session.fullPageScreenshotBase64 || null,
    elementScreenshots,
    ...(session.recording?.base64 ? { recordingBase64: session.recording.base64 } : {}),
  };

  const res = await fetch(`http://localhost:${port}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`MCP server error ${res.status}: ${body}`);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add extension/src/background/mcp.ts
git commit -m "feat: MCP sender POSTs session to localhost:3579"
```

---

### Task 8: Screenshot capture (scroll-and-stitch)

**Files:**
- Create: `extension/src/offscreen/canvas.ts`
- Create: `extension/src/offscreen/index.ts`
- Create: `extension/src/background/screenshot.ts`

- [ ] **Step 1: Implement offscreen/canvas.ts**

```typescript
// extension/src/offscreen/canvas.ts
export async function stitchStrips(strips: string[]): Promise<string> {
  const images = await Promise.all(
    strips.map((src) => new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    }))
  );

  const width = images[0].width;
  const totalHeight = images.reduce((sum, img) => sum + img.height, 0);

  const canvas = new OffscreenCanvas(width, totalHeight);
  const ctx = canvas.getContext('2d')!;
  let y = 0;
  for (const img of images) {
    ctx.drawImage(img, 0, y);
    y += img.height;
  }

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return blobToBase64(blob);
}

export async function cropFromFullPage(
  fullPageBase64: string,
  x: number, y: number, width: number, height: number,
): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = `data:image/png;base64,${fullPageBase64}`;
  });

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, x, y, width, height, 0, 0, width, height);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return blobToBase64(blob);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
```

- [ ] **Step 2: Implement offscreen/recorder.ts**

```typescript
// extension/src/offscreen/recorder.ts
let mediaRecorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let startTime = 0;
let activeSources: ('screen' | 'microphone' | 'tab-audio')[] = [];

export async function startRecording(sources: ('screen' | 'microphone' | 'tab-audio')[]): Promise<void> {
  activeSources = sources;
  chunks = [];

  const constraints: DisplayMediaStreamOptions = {
    video: true,
    audio: sources.includes('tab-audio'),
  };
  const screenStream = await navigator.mediaDevices.getDisplayMedia(constraints);

  const tracks = [...screenStream.getTracks()];

  if (sources.includes('microphone')) {
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    micStream.getAudioTracks().forEach((t) => tracks.push(t));
  }

  const combinedStream = new MediaStream(tracks);
  mediaRecorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm;codecs=vp9' });
  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  startTime = Date.now();
  mediaRecorder.start(1000);
}

export function stopRecording(): Promise<{ base64: string; durationMs: number; sources: typeof activeSources }> {
  return new Promise((resolve, reject) => {
    if (!mediaRecorder) { reject(new Error('No active recording')); return; }
    const durationMs = Date.now() - startTime;
    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const base64 = await blobToBase64(blob);
      resolve({ base64, durationMs, sources: activeSources });
    };
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach((t) => t.stop());
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
```

- [ ] **Step 3: Implement offscreen/index.ts**

```typescript
// extension/src/offscreen/index.ts
import { stitchStrips, cropFromFullPage } from './canvas.js';
import { startRecording, stopRecording } from './recorder.js';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'STITCH_SCREENSHOTS') {
    stitchStrips(message.strips).then(sendResponse);
    return true;
  }
  if (message.type === 'CROP_ELEMENT') {
    const { fullPageBase64, x, y, width, height } = message;
    cropFromFullPage(fullPageBase64, x, y, width, height).then(sendResponse);
    return true;
  }
  if (message.type === 'START_RECORDING') {
    startRecording(message.sources).then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ error: String(e) }));
    return true;
  }
  if (message.type === 'STOP_RECORDING') {
    stopRecording().then(sendResponse).catch((e) => sendResponse({ error: String(e) }));
    return true;
  }
});
```

- [ ] **Step 4: Implement background/screenshot.ts**

```typescript
// extension/src/background/screenshot.ts
const OFFSCREEN_URL = chrome.runtime.getURL('offscreen.html');

async function ensureOffscreen(): Promise<void> {
  const existing = await (chrome as any).offscreen?.getContexts?.() ?? [];
  if (existing.length === 0) {
    await (chrome as any).offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['BLOBS'],
      justification: 'Canvas stitching and MediaRecorder for Send2LLM',
    });
  }
}

export async function captureFullPage(tabId: number): Promise<string> {
  await ensureOffscreen();

  const [{ windowId }] = await chrome.tabs.query({ active: true, currentWindow: true });
  const scrollInfo: { scrollY: number; scrollHeight: number; viewportHeight: number } =
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({ scrollY: window.scrollY, scrollHeight: document.body.scrollHeight, viewportHeight: window.innerHeight }),
    }).then((r) => r[0].result);

  // Scroll to top
  await chrome.scripting.executeScript({ target: { tabId }, func: () => window.scrollTo(0, 0) });
  await new Promise((r) => setTimeout(r, 150));

  const strips: string[] = [];
  let scrolled = 0;

  while (scrolled < scrollInfo.scrollHeight) {
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId!, { format: 'png' });
    strips.push(dataUrl);
    scrolled += scrollInfo.viewportHeight;
    if (scrolled < scrollInfo.scrollHeight) {
      await chrome.scripting.executeScript({ target: { tabId }, func: (y: number) => window.scrollTo(0, y), args: [scrolled] });
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  // Restore scroll position
  await chrome.scripting.executeScript({ target: { tabId }, func: (y: number) => window.scrollTo(0, y), args: [scrollInfo.scrollY] });

  const base64 = await chrome.runtime.sendMessage({ type: 'STITCH_SCREENSHOTS', strips });
  return base64 as string;
}

export async function cropElement(
  fullPageBase64: string, x: number, y: number, width: number, height: number,
): Promise<string> {
  return chrome.runtime.sendMessage({ type: 'CROP_ELEMENT', fullPageBase64, x, y, width, height }) as Promise<string>;
}
```

- [ ] **Step 5: Commit**

```bash
git add extension/src/offscreen/ extension/src/background/screenshot.ts
git commit -m "feat: scroll-and-stitch screenshot capture with offscreen canvas"
```

---

### Task 9: Background message router

**Files:**
- Create: `extension/src/background/index.ts`

- [ ] **Step 1: Implement background/index.ts**

```typescript
// extension/src/background/index.ts
import { captureFullPage, cropElement } from './screenshot.js';
import { buildMarkdown, buildZip } from './export.js';
import { sendToMcp } from './mcp.js';
import type { Session } from '../shared/types.js';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CAPTURE_FULL_PAGE') {
    captureFullPage(message.tabId)
      .then((base64) => sendResponse({ base64 }))
      .catch((e) => sendResponse({ error: String(e) }));
    return true;
  }

  if (message.type === 'CROP_ELEMENT') {
    const { fullPageBase64, boundingBox } = message;
    cropElement(fullPageBase64, boundingBox.x, boundingBox.y, boundingBox.width, boundingBox.height)
      .then((base64) => sendResponse({ base64 }))
      .catch((e) => sendResponse({ error: String(e) }));
    return true;
  }

  if (message.type === 'EXPORT_MARKDOWN') {
    const md = buildMarkdown(message.session as Session);
    sendResponse({ markdown: md });
    return true;
  }

  if (message.type === 'EXPORT_ZIP') {
    buildZip(message.session as Session)
      .then(async (blob) => {
        const ab = await blob.arrayBuffer();
        sendResponse({ buffer: Array.from(new Uint8Array(ab)) });
      })
      .catch((e) => sendResponse({ error: String(e) }));
    return true;
  }

  if (message.type === 'SEND_TO_MCP') {
    const port = message.port ?? 3579;
    sendToMcp(message.session as Session, port)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ error: String(e) }));
    return true;
  }

  if (message.type === 'START_RECORDING') {
    chrome.runtime.sendMessage({ type: 'START_RECORDING', sources: message.sources })
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ error: String(e) }));
    return true;
  }

  if (message.type === 'STOP_RECORDING') {
    chrome.runtime.sendMessage({ type: 'STOP_RECORDING' })
      .then((result) => sendResponse(result))
      .catch((e) => sendResponse({ error: String(e) }));
    return true;
  }
});

// Enable annotation mode when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDEBAR' });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add extension/src/background/index.ts
git commit -m "feat: background message router for screenshot/export/mcp/recording"
```

---

### Task 10: Sidebar UI

**Files:**
- Create: `extension/src/content/sidebar/sidebar.css`
- Create: `extension/src/content/sidebar/annotation-list.ts`
- Create: `extension/src/content/sidebar/popover.ts`
- Create: `extension/src/content/sidebar/recorder-bar.ts`
- Create: `extension/src/content/sidebar/sidebar.ts`

- [ ] **Step 1: Implement sidebar.css**

```css
/* extension/src/content/sidebar/sidebar.css */
:host {
  all: initial;
  font-family: system-ui, sans-serif;
  font-size: 13px;
  color: #1a1a1a;
}

#s2l-sidebar {
  position: fixed;
  top: 80px;
  right: 0;
  width: 260px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-right: none;
  border-radius: 8px 0 0 8px;
  box-shadow: -4px 4px 16px rgba(0,0,0,0.12);
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 120px);
  overflow: hidden;
  transition: transform 0.2s ease;
}

#s2l-sidebar.collapsed {
  transform: translateX(240px);
}

.s2l-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  background: #1e293b;
  color: #fff;
  border-radius: 8px 0 0 0;
  flex-shrink: 0;
}

.s2l-title { font-weight: 600; font-size: 12px; letter-spacing: 0.5px; }

.s2l-header-actions { display: flex; gap: 4px; }

.s2l-btn-icon {
  background: none; border: none; color: #94a3b8; cursor: pointer;
  font-size: 14px; padding: 2px 4px; border-radius: 3px;
}
.s2l-btn-icon:hover { color: #fff; background: rgba(255,255,255,0.1); }

.s2l-toolbar {
  display: flex; gap: 6px; padding: 8px;
  border-bottom: 1px solid #f1f5f9; flex-shrink: 0;
}

.s2l-btn {
  flex: 1; padding: 5px 8px; border-radius: 5px; border: 1px solid #e2e8f0;
  background: #f8fafc; cursor: pointer; font-size: 11px; font-weight: 500;
  transition: background 0.15s;
}
.s2l-btn:hover { background: #e2e8f0; }
.s2l-btn.active { background: #f97316; color: #fff; border-color: #f97316; }

.s2l-annotations {
  flex: 1; overflow-y: auto; padding: 6px;
}

.s2l-annotation-item {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 6px 8px; border-radius: 5px; margin-bottom: 4px;
  background: #f8fafc; border: 1px solid #e2e8f0; gap: 6px;
}

.s2l-ann-badge {
  font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 3px;
  text-transform: uppercase; flex-shrink: 0;
}
.s2l-ann-badge.task { background: #dbeafe; color: #1d4ed8; }
.s2l-ann-badge.bug  { background: #fee2e2; color: #dc2626; }
.s2l-ann-badge.comment { background: #d1fae5; color: #065f46; }
.s2l-ann-badge.request { background: #fef3c7; color: #92400e; }

.s2l-ann-note { font-size: 11px; flex: 1; line-height: 1.3; }

.s2l-ann-delete {
  background: none; border: none; cursor: pointer; color: #94a3b8;
  font-size: 12px; padding: 0; flex-shrink: 0;
}
.s2l-ann-delete:hover { color: #dc2626; }

.s2l-footer {
  display: flex; gap: 6px; padding: 8px;
  border-top: 1px solid #f1f5f9; flex-shrink: 0;
}

.s2l-btn-primary {
  flex: 1; padding: 6px; border-radius: 5px; border: none;
  background: #1e293b; color: #fff; cursor: pointer; font-size: 11px; font-weight: 600;
}
.s2l-btn-primary:hover { background: #334155; }

.s2l-btn-export {
  position: relative; flex: 1;
}

.s2l-export-menu {
  position: absolute; bottom: 100%; right: 0; background: #fff;
  border: 1px solid #e2e8f0; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  padding: 4px; display: none; min-width: 150px; z-index: 10;
}
.s2l-export-menu.open { display: block; }

.s2l-export-option {
  display: block; width: 100%; text-align: left; background: none; border: none;
  padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 11px;
}
.s2l-export-option:hover { background: #f1f5f9; }

.s2l-rec-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 10px; background: #fee2e2; gap: 8px;
}

.s2l-rec-dot { color: #dc2626; font-size: 10px; animation: blink 1s infinite; }
@keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }

.s2l-rec-timer { font-weight: 600; font-size: 12px; }

.s2l-rec-sources { display: flex; gap: 6px; font-size: 10px; }

.s2l-source-check { display: flex; align-items: center; gap: 3px; cursor: pointer; }

.s2l-rec-stop {
  padding: 4px 10px; border-radius: 4px; background: #dc2626; color: #fff;
  border: none; cursor: pointer; font-size: 11px; font-weight: 600;
}

.s2l-popover {
  position: fixed; background: #fff; border: 1px solid #e2e8f0;
  border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.15);
  padding: 12px; width: 280px; z-index: 2147483648;
}

.s2l-type-row { display: flex; gap: 4px; margin-bottom: 8px; }

.s2l-type-btn {
  flex: 1; padding: 4px; border-radius: 4px; border: 1px solid #e2e8f0;
  background: #f8fafc; cursor: pointer; font-size: 10px; font-weight: 600; text-transform: uppercase;
}
.s2l-type-btn.selected { background: #1e293b; color: #fff; border-color: #1e293b; }

.s2l-note-input {
  width: 100%; box-sizing: border-box; padding: 6px 8px;
  border: 1px solid #e2e8f0; border-radius: 5px; font-size: 12px;
  resize: vertical; min-height: 60px; font-family: inherit; margin-bottom: 8px;
}

.s2l-popover-actions { display: flex; gap: 6px; justify-content: flex-end; }

.s2l-btn-add {
  padding: 5px 14px; border-radius: 5px; background: #f97316; color: #fff;
  border: none; cursor: pointer; font-size: 11px; font-weight: 600;
}
.s2l-btn-cancel {
  padding: 5px 10px; border-radius: 5px; background: #f1f5f9;
  border: 1px solid #e2e8f0; cursor: pointer; font-size: 11px;
}

.s2l-empty { color: #94a3b8; font-size: 11px; text-align: center; padding: 16px 0; }
```

- [ ] **Step 2: Implement annotation-list.ts**

```typescript
// extension/src/content/sidebar/annotation-list.ts
import type { Annotation } from '../../shared/types.js';

export function renderAnnotationList(
  annotations: Annotation[],
  onDelete: (id: string) => void,
  root: ShadowRoot,
): void {
  const container = root.getElementById('s2l-annotation-list')!;
  container.innerHTML = '';

  if (annotations.length === 0) {
    container.innerHTML = '<div class="s2l-empty">No annotations yet.<br>Click Pick Element to start.</div>';
    return;
  }

  for (const ann of annotations) {
    const item = document.createElement('div');
    item.className = 's2l-annotation-item';
    item.innerHTML = `
      <span class="s2l-ann-badge ${ann.type}">${ann.type}</span>
      <span class="s2l-ann-note">#${ann.number} ${ann.note}</span>
      <button class="s2l-ann-delete" title="Delete annotation">✕</button>
    `;
    item.querySelector('.s2l-ann-delete')!.addEventListener('click', () => onDelete(ann.id));
    container.appendChild(item);
  }
}
```

- [ ] **Step 3: Implement popover.ts**

```typescript
// extension/src/content/sidebar/popover.ts
import type { Annotation } from '../../shared/types.js';
import { generateId } from '../../shared/utils.js';

type AnnotationType = Annotation['type'];

export function showPopover(
  anchorEl: Element,
  annotationNumber: number,
  onAdd: (partial: Pick<Annotation, 'type' | 'note'>) => void,
  onCancel: () => void,
): void {
  const existing = document.getElementById('s2l-popover-host');
  if (existing) existing.remove();

  const host = document.createElement('div');
  host.id = 's2l-popover-host';
  const shadow = host.attachShadow({ mode: 'open' });

  const rect = anchorEl.getBoundingClientRect();
  let selectedType: AnnotationType = 'task';

  const types: AnnotationType[] = ['task', 'bug', 'comment', 'request'];

  shadow.innerHTML = `
    <div class="s2l-popover" style="top:${Math.min(rect.bottom + window.scrollY + 8, window.innerHeight - 200)}px;left:${rect.left + window.scrollX}px">
      <div class="s2l-type-row">
        ${types.map((t) => `<button class="s2l-type-btn${t === 'task' ? ' selected' : ''}" data-type="${t}">${t}</button>`).join('')}
      </div>
      <textarea class="s2l-note-input" placeholder="Describe the annotation…"></textarea>
      <div class="s2l-popover-actions">
        <button class="s2l-btn-cancel">Cancel</button>
        <button class="s2l-btn-add">Add</button>
      </div>
    </div>
  `;

  shadow.querySelectorAll('.s2l-type-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      shadow.querySelectorAll('.s2l-type-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedType = (btn as HTMLElement).dataset.type as AnnotationType;
    });
  });

  shadow.querySelector('.s2l-btn-cancel')!.addEventListener('click', () => {
    host.remove();
    onCancel();
  });

  shadow.querySelector('.s2l-btn-add')!.addEventListener('click', () => {
    const note = (shadow.querySelector('.s2l-note-input') as HTMLTextAreaElement).value.trim();
    if (!note) return;
    host.remove();
    onAdd({ type: selectedType, note });
  });

  document.body.appendChild(host);
  (shadow.querySelector('.s2l-note-input') as HTMLTextAreaElement).focus();
}
```

- [ ] **Step 4: Implement recorder-bar.ts**

```typescript
// extension/src/content/sidebar/recorder-bar.ts
type RecordingSource = 'screen' | 'microphone' | 'tab-audio';

let timerInterval: ReturnType<typeof setInterval> | null = null;

export function renderRecorderBar(
  root: ShadowRoot,
  isRecording: boolean,
  elapsedMs: number,
  selectedSources: Set<RecordingSource>,
  onStart: (sources: RecordingSource[]) => void,
  onStop: () => void,
): void {
  const bar = root.getElementById('s2l-rec-bar')!;

  if (!isRecording) {
    bar.innerHTML = `
      <div class="s2l-rec-sources">
        ${(['screen', 'microphone', 'tab-audio'] as RecordingSource[]).map((s) => `
          <label class="s2l-source-check">
            <input type="checkbox" data-source="${s}" ${selectedSources.has(s) ? 'checked' : ''}> ${s}
          </label>`).join('')}
      </div>
      <button class="s2l-btn s2l-btn-record">⏺ Record</button>
    `;
    bar.querySelector('.s2l-btn-record')!.addEventListener('click', () => {
      const sources = Array.from(bar.querySelectorAll<HTMLInputElement>('input[data-source]:checked'))
        .map((i) => i.dataset.source as RecordingSource);
      onStart(sources.length ? sources : ['screen']);
    });
  } else {
    const seconds = Math.floor(elapsedMs / 1000);
    const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
    const ss = String(seconds % 60).padStart(2, '0');
    bar.innerHTML = `
      <span class="s2l-rec-dot">●</span>
      <span class="s2l-rec-timer">REC ${mm}:${ss}</span>
      <button class="s2l-rec-stop">Stop</button>
    `;
    bar.querySelector('.s2l-rec-stop')!.addEventListener('click', onStop);
  }
}
```

- [ ] **Step 5: Implement sidebar.ts**

```typescript
// extension/src/content/sidebar/sidebar.ts
import type { Annotation, Session } from '../../shared/types.js';
import { generateId, formatDate } from '../../shared/utils.js';
import { startPicker, stopPicker, getElementInfo } from '../element-picker.js';
import { getConsoleLogs } from '../console-capture.js';
import { renderAnnotationList } from './annotation-list.js';
import { showPopover } from './popover.js';
import { renderRecorderBar } from './recorder-bar.js';

let sidebarHost: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let annotations: Annotation[] = [];
let pickingMode = false;
let isRecording = false;
let recordingStart = 0;
let recordingInterval: ReturnType<typeof setInterval> | null = null;
let selectedSources = new Set<'screen' | 'microphone' | 'tab-audio'>(['screen']);
let fullPageBase64 = '';

export function mountSidebar(): void {
  if (sidebarHost) return;
  sidebarHost = document.createElement('div');
  sidebarHost.id = 's2l-sidebar-host';
  shadow = sidebarHost.attachShadow({ mode: 'open' });
  document.body.appendChild(sidebarHost);
  renderSidebar();
}

export function unmountSidebar(): void {
  sidebarHost?.remove();
  sidebarHost = null;
  shadow = null;
  annotations = [];
  stopPicker();
}

export function toggleSidebar(): void {
  if (sidebarHost) { unmountSidebar(); } else { mountSidebar(); }
}

function renderSidebar(): void {
  if (!shadow) return;

  const cssUrl = chrome.runtime.getURL('content/sidebar/sidebar.css');

  shadow.innerHTML = `
    <link rel="stylesheet" href="${cssUrl}">
    <div id="s2l-sidebar">
      <div class="s2l-header">
        <span class="s2l-title">● Send2LLM</span>
        <div class="s2l-header-actions">
          <button class="s2l-btn-icon" id="s2l-collapse-btn" title="Collapse">−</button>
          <button class="s2l-btn-icon" id="s2l-close-btn" title="Close">✕</button>
        </div>
      </div>
      <div class="s2l-toolbar">
        <button class="s2l-btn ${pickingMode ? 'active' : ''}" id="s2l-pick-btn">Pick Element</button>
      </div>
      <div class="s2l-annotations" id="s2l-annotation-list"></div>
      <div id="s2l-rec-bar" class="s2l-rec-bar"></div>
      <div class="s2l-footer">
        <div class="s2l-btn-export">
          <button class="s2l-btn" id="s2l-export-toggle">Export ▾</button>
          <div class="s2l-export-menu" id="s2l-export-menu">
            <button class="s2l-export-option" data-action="copy-md">Copy Markdown</button>
            <button class="s2l-export-option" data-action="download-zip">Download ZIP</button>
            <button class="s2l-export-option" data-action="download-json">Download JSON</button>
          </div>
        </div>
        <button class="s2l-btn-primary" id="s2l-mcp-btn">Send → MCP</button>
      </div>
    </div>
  `;

  renderAnnotationList(annotations, deleteAnnotation, shadow);
  renderRecorderBar(shadow, isRecording, isRecording ? Date.now() - recordingStart : 0,
    selectedSources, handleStartRecording, handleStopRecording);

  shadow.getElementById('s2l-close-btn')!.addEventListener('click', unmountSidebar);
  shadow.getElementById('s2l-collapse-btn')!.addEventListener('click', () => {
    shadow!.getElementById('s2l-sidebar')!.classList.toggle('collapsed');
  });
  shadow.getElementById('s2l-pick-btn')!.addEventListener('click', togglePickMode);
  shadow.getElementById('s2l-export-toggle')!.addEventListener('click', () => {
    shadow!.getElementById('s2l-export-menu')!.classList.toggle('open');
  });
  shadow.querySelectorAll('.s2l-export-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = (btn as HTMLElement).dataset.action!;
      shadow!.getElementById('s2l-export-menu')!.classList.remove('open');
      handleExport(action);
    });
  });
  shadow.getElementById('s2l-mcp-btn')!.addEventListener('click', handleSendToMcp);
}

function togglePickMode(): void {
  pickingMode = !pickingMode;
  if (pickingMode) {
    startPicker(async (el) => {
      pickingMode = false;
      const info = getElementInfo(el);
      showPopover(el, annotations.length + 1, async (partial) => {
        const ann: Annotation = {
          id: generateId(),
          number: annotations.length + 1,
          ...partial,
          ...info,
          elementScreenshotBase64: '',
          elementScreenshotPath: '',
          createdAt: new Date().toISOString(),
        };
        if (fullPageBase64) {
          const { base64 } = await chrome.runtime.sendMessage({
            type: 'CROP_ELEMENT', fullPageBase64, boundingBox: info.boundingBox,
          });
          ann.elementScreenshotBase64 = base64 ?? '';
        }
        annotations.push(ann);
        renderSidebar();
      }, () => { pickingMode = false; renderSidebar(); });
    });
  } else {
    stopPicker();
  }
  renderSidebar();
}

function deleteAnnotation(id: string): void {
  annotations = annotations.filter((a) => a.id !== id);
  annotations.forEach((a, i) => { a.number = i + 1; });
  renderSidebar();
}

async function buildSession(): Promise<Session> {
  if (!fullPageBase64) {
    const tab = await chrome.tabs.getCurrent();
    const res = await chrome.runtime.sendMessage({ type: 'CAPTURE_FULL_PAGE', tabId: tab?.id });
    fullPageBase64 = res?.base64 ?? '';
  }
  return {
    id: generateId(),
    url: window.location.href,
    pageTitle: document.title,
    capturedAt: new Date().toISOString(),
    fullPageScreenshotBase64: fullPageBase64,
    fullPageScreenshotPath: '',
    annotations: [...annotations],
    consoleLogs: getConsoleLogs(),
    sessionStorage: { ...window.sessionStorage },
  };
}

async function handleExport(action: string): Promise<void> {
  const session = await buildSession();
  if (action === 'copy-md') {
    const { markdown } = await chrome.runtime.sendMessage({ type: 'EXPORT_MARKDOWN', session });
    await navigator.clipboard.writeText(markdown);
  } else if (action === 'download-zip') {
    const { buffer } = await chrome.runtime.sendMessage({ type: 'EXPORT_ZIP', session });
    const blob = new Blob([new Uint8Array(buffer)], { type: 'application/zip' });
    downloadBlob(blob, `send2llm-${Date.now()}.zip`);
  } else if (action === 'download-json') {
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `send2llm-${Date.now()}.json`);
  }
}

async function handleSendToMcp(): Promise<void> {
  const session = await buildSession();
  const res = await chrome.runtime.sendMessage({ type: 'SEND_TO_MCP', session });
  if (res?.error) alert(`Send2LLM: MCP error — ${res.error}`);
  else alert('Send2LLM: Session sent to MCP server.');
}

async function handleStartRecording(sources: ('screen' | 'microphone' | 'tab-audio')[]): Promise<void> {
  selectedSources = new Set(sources);
  const res = await chrome.runtime.sendMessage({ type: 'START_RECORDING', sources });
  if (res?.error) { alert(`Recording error: ${res.error}`); return; }
  isRecording = true;
  recordingStart = Date.now();
  recordingInterval = setInterval(() => renderRecorderBar(
    shadow!, true, Date.now() - recordingStart, selectedSources,
    handleStartRecording, handleStopRecording,
  ), 1000);
  renderSidebar();
}

async function handleStopRecording(): Promise<void> {
  if (recordingInterval) { clearInterval(recordingInterval); recordingInterval = null; }
  const res = await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
  isRecording = false;
  if (res?.base64 && !res.error) {
    // Store recording in next session build
    (window as any).__s2l_recording = {
      base64: res.base64, durationMs: res.durationMs, sources: res.sources,
      filename: 'recording.webm', path: '',
    };
  }
  renderSidebar();
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 6: Commit**

```bash
git add extension/src/content/sidebar/
git commit -m "feat: floating sidebar with annotation list, popover, and recorder bar"
```

---

### Task 11: Content script entry + popup

**Files:**
- Create: `extension/src/content/index.ts`
- Create: `extension/src/popup/popup.html`
- Create: `extension/src/popup/popup.ts`
- Create: `extension/src/popup/popup.css`

- [ ] **Step 1: Implement content/index.ts**

```typescript
// extension/src/content/index.ts
import { startConsoleCapture } from './console-capture.js';
import { toggleSidebar } from './sidebar/sidebar.js';

startConsoleCapture();

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'TOGGLE_SIDEBAR') {
    toggleSidebar();
  }
});
```

- [ ] **Step 2: Create popup.html**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="container">
    <h1 class="title">Send2LLM</h1>
    <p class="subtitle">Annotate pages for AI agents</p>
    <button id="toggle-btn" class="btn-toggle">Activate on this tab</button>
  </div>
  <script src="popup.js" type="module"></script>
</body>
</html>
```

- [ ] **Step 3: Implement popup.ts**

```typescript
// extension/src/popup/popup.ts
document.getElementById('toggle-btn')!.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab.id) {
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDEBAR' });
    window.close();
  }
});
```

- [ ] **Step 4: Implement popup.css**

```css
/* extension/src/popup/popup.css */
body { margin: 0; font-family: system-ui, sans-serif; background: #1e293b; color: #f8fafc; width: 220px; }
.container { padding: 16px; }
.title { font-size: 15px; font-weight: 700; margin: 0 0 4px; }
.subtitle { font-size: 11px; color: #94a3b8; margin: 0 0 14px; }
.btn-toggle {
  width: 100%; padding: 8px; border-radius: 6px; border: none;
  background: #f97316; color: #fff; cursor: pointer; font-weight: 600; font-size: 12px;
}
.btn-toggle:hover { background: #ea6d0e; }
```

- [ ] **Step 5: Commit**

```bash
git add extension/src/content/index.ts extension/src/popup/
git commit -m "feat: content script entry and toolbar popup"
```

---

### Task 12: Manifests + Vite build config

**Files:**
- Create: `extension/manifests/manifest.chrome.json`
- Create: `extension/manifests/manifest.firefox.json`
- Create: `extension/manifests/manifest.edge.json`
- Create: `extension/src/offscreen/offscreen.html`
- Create: `extension/vite.config.ts`

- [ ] **Step 1: Create manifest.chrome.json**

```json
{
  "manifest_version": 3,
  "name": "Send2LLM",
  "version": "0.1.0",
  "description": "Annotate web pages and send context to AI coding agents",
  "permissions": ["activeTab", "scripting", "storage", "offscreen", "tabs"],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background/index.js", "type": "module" },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content/index.js"],
    "run_at": "document_start"
  }],
  "action": { "default_popup": "popup/popup.html", "default_icon": { "32": "icon32.png" } },
  "web_accessible_resources": [{
    "resources": ["offscreen.html", "content/sidebar/sidebar.css"],
    "matches": ["<all_urls>"]
  }]
}
```

- [ ] **Step 2: Create manifest.firefox.json**

```json
{
  "manifest_version": 2,
  "name": "Send2LLM",
  "version": "0.1.0",
  "description": "Annotate web pages and send context to AI coding agents",
  "permissions": ["activeTab", "storage", "tabs", "<all_urls>"],
  "background": { "scripts": ["background/index.js"], "persistent": true },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content/index.js"],
    "run_at": "document_start"
  }],
  "browser_action": { "default_popup": "popup/popup.html", "default_icon": { "32": "icon32.png" } },
  "web_accessible_resources": ["content/sidebar/sidebar.css"]
}
```

- [ ] **Step 3: Create manifest.edge.json (identical to Chrome)**

Copy manifest.chrome.json contents exactly.

- [ ] **Step 4: Create offscreen.html**

```html
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body><script src="offscreen/index.js" type="module"></script></body>
</html>
```

- [ ] **Step 5: Create vite.config.ts**

```typescript
// extension/vite.config.ts
import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync } from 'fs';

const browser = process.env.BROWSER ?? 'chrome';
const outDir = `dist/${browser}`;

export default defineConfig({
  define: {
    __BROWSER__: JSON.stringify(browser),
  },
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        'background/index': resolve(__dirname, 'src/background/index.ts'),
        'content/index': resolve(__dirname, 'src/content/index.ts'),
        'offscreen/index': resolve(__dirname, 'src/offscreen/index.ts'),
        'popup/popup': resolve(__dirname, 'src/popup/popup.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: '[name][extname]',
        format: 'esm',
      },
    },
  },
  plugins: [
    {
      name: 'copy-extension-files',
      closeBundle() {
        // Copy manifest
        copyFileSync(
          resolve(__dirname, `manifests/manifest.${browser}.json`),
          resolve(__dirname, `${outDir}/manifest.json`),
        );
        // Copy popup HTML
        mkdirSync(resolve(__dirname, `${outDir}/popup`), { recursive: true });
        copyFileSync(
          resolve(__dirname, 'src/popup/popup.html'),
          resolve(__dirname, `${outDir}/popup/popup.html`),
        );
        // Copy offscreen HTML
        copyFileSync(
          resolve(__dirname, 'src/offscreen/offscreen.html'),
          resolve(__dirname, `${outDir}/offscreen.html`),
        );
        // Copy sidebar CSS as web-accessible resource
        mkdirSync(resolve(__dirname, `${outDir}/content/sidebar`), { recursive: true });
        copyFileSync(
          resolve(__dirname, 'src/content/sidebar/sidebar.css'),
          resolve(__dirname, `${outDir}/content/sidebar/sidebar.css`),
        );
      },
    },
  ],
});
```

- [ ] **Step 6: Build Chrome extension**

```bash
cd extension && npm run build:chrome
```

Expected: `dist/chrome/` contains `manifest.json`, `background/index.js`, `content/index.js`, `offscreen/index.js`, `popup/popup.js`, `popup/popup.html`, `offscreen.html`.

No build errors.

- [ ] **Step 7: Build Firefox and Edge**

```bash
cd extension && npm run build:firefox && npm run build:edge
```

Expected: `dist/firefox/` and `dist/edge/` created without errors.

- [ ] **Step 8: Commit**

```bash
git add extension/manifests/ extension/src/offscreen/offscreen.html extension/vite.config.ts
git commit -m "feat: extension manifests and Vite build config for Chrome/Firefox/Edge"
```

---

### Task 13: Load and smoke test in Chrome

- [ ] **Step 1: Open Chrome and load extension**

1. Open Chrome → `chrome://extensions`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select `extension/dist/chrome/`

Expected: Extension appears in list with no errors.

- [ ] **Step 2: Test annotation flow**

1. Open any webpage (e.g. https://example.com)
2. Click the Send2LLM extension icon → sidebar appears on right
3. Click "Pick Element" → cursor changes to crosshair
4. Hover over an element → orange outline appears
5. Click the element → popover appears with type picker and note field
6. Select "Task", type "Fix this heading", click Add
7. Annotation appears in sidebar list as "#1 [task] Fix this heading"

Expected: All steps work without console errors.

- [ ] **Step 3: Test delete annotation**

1. With annotation #1 in the list, click the ✕ button next to it
2. Annotation removed from list

Expected: List shows "No annotations yet."

- [ ] **Step 4: Test export**

1. Add an annotation
2. Click "Export ▾" → menu shows 3 options
3. Click "Copy Markdown" → paste into a text editor, verify it contains the URL, annotation note, and a base64 image
4. Click "Download JSON" → file downloads, open it, verify it's valid JSON with the session data

- [ ] **Step 5: Test Send→MCP (requires MCP server running)**

```bash
cd mcp-server && npm start
```

Then in the extension: click "Send → MCP". Expected: success alert. Verify in terminal that server logged the POST.

- [ ] **Step 6: Commit final state**

```bash
git add .
git commit -m "feat: complete extension implementation"
```
