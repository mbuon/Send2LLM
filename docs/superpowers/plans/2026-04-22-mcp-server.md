# Send2LLM MCP Server — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Node.js MCP server that receives session payloads from the browser extension, stores them in SQLite + filesystem, and exposes MCP tools for LLM agents to query annotations, screenshots, logs, and recordings.

**Architecture:** HTTP server on port 3579 accepts POST /sessions from the extension. MCP server (stdio transport) exposes query/delete tools. SQLite stores metadata; binary assets (PNG, webm) live on disk at ~/.send2llm/sessions/{id}/.

**Tech Stack:** Node.js 20+, TypeScript, @modelcontextprotocol/sdk, better-sqlite3, express, uuid, vitest

---

## File Map

| File | Responsibility |
|---|---|
| `mcp-server/package.json` | Dependencies and scripts |
| `mcp-server/tsconfig.json` | TypeScript config |
| `mcp-server/src/types.ts` | Shared TS interfaces: Session, Annotation, ConsoleEntry, RecordingMeta |
| `mcp-server/src/db.ts` | SQLite init, schema creation, all CRUD queries |
| `mcp-server/src/storage.ts` | Filesystem ops: write PNG/webm to ~/.send2llm/, delete session dir |
| `mcp-server/src/http.ts` | Express HTTP server: POST /sessions endpoint |
| `mcp-server/src/index.ts` | Entry point: starts HTTP server + MCP server (stdio) |
| `mcp-server/src/tools/list-sessions.ts` | MCP tool: list_sessions() |
| `mcp-server/src/tools/load-session.ts` | MCP tool: load_session(id or number) |
| `mcp-server/src/tools/get-annotations.ts` | MCP tool: get_annotations(session_id) |
| `mcp-server/src/tools/get-annotation.ts` | MCP tool: get_annotation(session_id, n) |
| `mcp-server/src/tools/get-screenshot.ts` | MCP tool: get_screenshot(session_id) |
| `mcp-server/src/tools/get-console-logs.ts` | MCP tool: get_console_logs(session_id) |
| `mcp-server/src/tools/get-session-storage.ts` | MCP tool: get_session_storage(session_id) |
| `mcp-server/src/tools/get-recording.ts` | MCP tool: get_recording(session_id) |
| `mcp-server/src/tools/delete-annotation.ts` | MCP tool: delete_annotation(session_id, n) |
| `mcp-server/tests/db.test.ts` | Unit tests for all db.ts functions |
| `mcp-server/tests/storage.test.ts` | Unit tests for storage.ts |
| `mcp-server/tests/http.test.ts` | Integration test for POST /sessions |
| `mcp-server/tests/tools.test.ts` | Unit tests for all MCP tools |

---

### Task 1: Project scaffold

**Files:**
- Create: `mcp-server/package.json`
- Create: `mcp-server/tsconfig.json`

- [ ] **Step 1: Create mcp-server/package.json**

```json
{
  "name": "send2llm-mcp-server",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.10.2",
    "better-sqlite3": "^9.6.0",
    "express": "^4.19.2",
    "uuid": "^10.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/express": "^4.17.21",
    "@types/node": "^20.14.0",
    "@types/uuid": "^10.0.0",
    "tsx": "^4.16.0",
    "typescript": "^5.5.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create mcp-server/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Install dependencies**

```bash
cd mcp-server && npm install
```

Expected: node_modules/ created, no errors.

- [ ] **Step 4: Commit**

```bash
git add mcp-server/package.json mcp-server/tsconfig.json
git commit -m "chore: scaffold mcp-server project"
```

---

### Task 2: Types

**Files:**
- Create: `mcp-server/src/types.ts`

- [ ] **Step 1: Write the types**

```typescript
// mcp-server/src/types.ts
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
  fullPageScreenshotPath: string;
  annotations: Annotation[];
  consoleLogs: ConsoleEntry[];
  sessionStorage: Record<string, string>;
  recording?: RecordingMeta;
}
```

- [ ] **Step 2: Commit**

```bash
git add mcp-server/src/types.ts
git commit -m "feat: add shared types for Session, Annotation, ConsoleEntry"
```

---

### Task 3: Database layer

**Files:**
- Create: `mcp-server/src/db.ts`
- Create: `mcp-server/tests/db.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// mcp-server/tests/db.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDb, insertSession, listSessions, getSessionById, getSessionByNumber, getAnnotationByNumber, deleteAnnotation } from '../src/db.js';
import type { Session } from '../src/types.js';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync } from 'fs';

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'test-id-1',
    url: 'https://example.com',
    pageTitle: 'Example',
    capturedAt: '2026-04-22T10:00:00Z',
    fullPageScreenshotPath: '/tmp/full-page.png',
    annotations: [
      {
        id: 'ann-1', number: 1, type: 'task', note: 'Fix the button',
        selector: 'button#login', elementHTML: '<button id="login">Login</button>',
        elementScreenshotPath: '/tmp/element-1.png',
        boundingBox: { x: 10, y: 20, width: 100, height: 40 },
        createdAt: '2026-04-22T10:00:01Z',
      },
    ],
    consoleLogs: [{ level: 'error', message: 'TypeError', timestamp: '2026-04-22T10:00:02Z' }],
    sessionStorage: { theme: 'dark' },
    ...overrides,
  };
}

let dbPath: string;
let db: ReturnType<typeof initDb>;

beforeEach(() => {
  dbPath = join(tmpdir(), `send2llm-test-${Date.now()}.db`);
  db = initDb(dbPath);
});

afterEach(() => {
  db.close();
  unlinkSync(dbPath);
});

describe('insertSession + listSessions', () => {
  it('inserts a session and lists it', () => {
    insertSession(db, makeSession());
    const list = listSessions(db);
    expect(list).toHaveLength(1);
    expect(list[0].number).toBe(1);
    expect(list[0].url).toBe('https://example.com');
    expect(list[0].annotationCount).toBe(1);
  });

  it('assigns ascending numbers to sessions', () => {
    insertSession(db, makeSession({ id: 'a' }));
    insertSession(db, makeSession({ id: 'b' }));
    const list = listSessions(db);
    expect(list[0].number).toBe(1);
    expect(list[1].number).toBe(2);
  });
});

describe('getSessionById', () => {
  it('returns full session with annotations and logs', () => {
    const s = makeSession();
    insertSession(db, s);
    const found = getSessionById(db, 'test-id-1');
    expect(found).not.toBeNull();
    expect(found!.annotations).toHaveLength(1);
    expect(found!.consoleLogs).toHaveLength(1);
    expect(found!.sessionStorage.theme).toBe('dark');
  });

  it('returns null for unknown id', () => {
    expect(getSessionById(db, 'unknown')).toBeNull();
  });
});

describe('getSessionByNumber', () => {
  it('returns session by 1-based list number', () => {
    insertSession(db, makeSession({ id: 'a', url: 'https://a.com' }));
    insertSession(db, makeSession({ id: 'b', url: 'https://b.com' }));
    const found = getSessionByNumber(db, 2);
    expect(found!.url).toBe('https://b.com');
  });
});

describe('getAnnotationByNumber', () => {
  it('returns the annotation with the given number within a session', () => {
    insertSession(db, makeSession());
    const ann = getAnnotationByNumber(db, 'test-id-1', 1);
    expect(ann).not.toBeNull();
    expect(ann!.note).toBe('Fix the button');
  });
});

describe('deleteAnnotation', () => {
  it('removes the annotation and returns true', () => {
    insertSession(db, makeSession());
    const deleted = deleteAnnotation(db, 'test-id-1', 1);
    expect(deleted).toBe(true);
    expect(getAnnotationByNumber(db, 'test-id-1', 1)).toBeNull();
  });

  it('returns false for non-existent annotation', () => {
    insertSession(db, makeSession());
    expect(deleteAnnotation(db, 'test-id-1', 99)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd mcp-server && npm test
```

Expected: FAIL — Cannot find module '../src/db.js'

- [ ] **Step 3: Implement db.ts**

```typescript
// mcp-server/src/db.ts
import Database from 'better-sqlite3';
import type { Session, Annotation, ConsoleEntry } from './types.js';

export type Db = InstanceType<typeof Database>;

export interface SessionListItem {
  id: string;
  number: number;
  url: string;
  pageTitle: string;
  capturedAt: string;
  annotationCount: number;
}

export function initDb(path: string): Db {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      number INTEGER NOT NULL,
      url TEXT NOT NULL,
      page_title TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      full_page_screenshot_path TEXT NOT NULL,
      session_storage TEXT NOT NULL DEFAULT '{}',
      recording TEXT
    );
    CREATE TABLE IF NOT EXISTS annotations (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      number INTEGER NOT NULL,
      type TEXT NOT NULL,
      note TEXT NOT NULL,
      selector TEXT NOT NULL,
      element_html TEXT NOT NULL,
      element_screenshot_path TEXT NOT NULL,
      bounding_box TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS console_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );
  `);
  return db;
}

export function insertSession(db: Db, session: Session): void {
  const nextNumber = (db.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number }).c + 1;
  db.prepare(`
    INSERT INTO sessions (id, number, url, page_title, captured_at, full_page_screenshot_path, session_storage, recording)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    session.id, nextNumber, session.url, session.pageTitle, session.capturedAt,
    session.fullPageScreenshotPath, JSON.stringify(session.sessionStorage),
    session.recording ? JSON.stringify(session.recording) : null,
  );
  for (const ann of session.annotations) {
    db.prepare(`
      INSERT INTO annotations (id, session_id, number, type, note, selector, element_html, element_screenshot_path, bounding_box, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(ann.id, session.id, ann.number, ann.type, ann.note, ann.selector,
           ann.elementHTML, ann.elementScreenshotPath, JSON.stringify(ann.boundingBox), ann.createdAt);
  }
  for (const log of session.consoleLogs) {
    db.prepare(`INSERT INTO console_logs (session_id, level, message, timestamp) VALUES (?, ?, ?, ?)`)
      .run(session.id, log.level, log.message, log.timestamp);
  }
}

export function listSessions(db: Db): SessionListItem[] {
  return db.prepare(`
    SELECT s.id, s.number, s.url, s.page_title as pageTitle, s.captured_at as capturedAt,
           COUNT(a.id) as annotationCount
    FROM sessions s
    LEFT JOIN annotations a ON a.session_id = s.id
    GROUP BY s.id ORDER BY s.number ASC
  `).all() as SessionListItem[];
}

export function getSessionById(db: Db, id: string): Session | null {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any;
  if (!row) return null;
  return hydrateSession(db, row);
}

export function getSessionByNumber(db: Db, number: number): Session | null {
  const row = db.prepare('SELECT * FROM sessions WHERE number = ?').get(number) as any;
  if (!row) return null;
  return hydrateSession(db, row);
}

function hydrateSession(db: Db, row: any): Session {
  const annotations = (db.prepare('SELECT * FROM annotations WHERE session_id = ? ORDER BY number ASC').all(row.id) as any[]).map(
    (a): Annotation => ({
      id: a.id, number: a.number, type: a.type, note: a.note, selector: a.selector,
      elementHTML: a.element_html, elementScreenshotPath: a.element_screenshot_path,
      boundingBox: JSON.parse(a.bounding_box), createdAt: a.created_at,
    })
  );
  const consoleLogs = (db.prepare('SELECT * FROM console_logs WHERE session_id = ? ORDER BY id ASC').all(row.id) as any[]).map(
    (l): ConsoleEntry => ({ level: l.level, message: l.message, timestamp: l.timestamp })
  );
  return {
    id: row.id, url: row.url, pageTitle: row.page_title,
    capturedAt: row.captured_at, fullPageScreenshotPath: row.full_page_screenshot_path,
    sessionStorage: JSON.parse(row.session_storage),
    recording: row.recording ? JSON.parse(row.recording) : undefined,
    annotations, consoleLogs,
  };
}

export function getAnnotationByNumber(db: Db, sessionId: string, number: number): Annotation | null {
  const row = db.prepare('SELECT * FROM annotations WHERE session_id = ? AND number = ?').get(sessionId, number) as any;
  if (!row) return null;
  return {
    id: row.id, number: row.number, type: row.type, note: row.note, selector: row.selector,
    elementHTML: row.element_html, elementScreenshotPath: row.element_screenshot_path,
    boundingBox: JSON.parse(row.bounding_box), createdAt: row.created_at,
  };
}

export function deleteAnnotation(db: Db, sessionId: string, number: number): boolean {
  const result = db.prepare('DELETE FROM annotations WHERE session_id = ? AND number = ?').run(sessionId, number);
  return result.changes > 0;
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd mcp-server && npm test
```

Expected: All db tests PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/db.ts mcp-server/tests/db.test.ts
git commit -m "feat: database layer with session/annotation CRUD"
```

---

### Task 4: Storage layer

**Files:**
- Create: `mcp-server/src/storage.ts`
- Create: `mcp-server/tests/storage.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// mcp-server/tests/storage.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initStorage, saveBase64Asset, deleteSessionDir, assetExists } from '../src/storage.js';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'send2llm-storage-test-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('initStorage', () => {
  it('creates sessions directory', () => {
    const { sessionsDir } = initStorage(root);
    expect(existsSync(sessionsDir)).toBe(true);
  });
});

describe('saveBase64Asset', () => {
  it('writes a PNG file and returns absolute path', async () => {
    initStorage(root);
    const base64 = Buffer.from('fake-png-data').toString('base64');
    const path = await saveBase64Asset(root, 'session-1', 'full-page.png', base64);
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path).toString()).toBe('fake-png-data');
  });
});

describe('deleteSessionDir', () => {
  it('removes the session directory', async () => {
    initStorage(root);
    const base64 = Buffer.from('x').toString('base64');
    const filePath = await saveBase64Asset(root, 'session-del', 'full-page.png', base64);
    deleteSessionDir(root, 'session-del');
    expect(existsSync(filePath)).toBe(false);
  });
});

describe('assetExists', () => {
  it('returns true for existing file, false otherwise', async () => {
    initStorage(root);
    const base64 = Buffer.from('x').toString('base64');
    await saveBase64Asset(root, 's1', 'full-page.png', base64);
    expect(assetExists(root, 's1', 'full-page.png')).toBe(true);
    expect(assetExists(root, 's1', 'missing.png')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd mcp-server && npm test
```

Expected: FAIL — Cannot find module '../src/storage.js'

- [ ] **Step 3: Implement storage.ts**

```typescript
// mcp-server/src/storage.ts
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface StorageInit {
  sessionsDir: string;
}

export function initStorage(root: string): StorageInit {
  const sessionsDir = join(root, 'sessions');
  mkdirSync(sessionsDir, { recursive: true });
  return { sessionsDir };
}

export async function saveBase64Asset(
  root: string, sessionId: string, filename: string, base64: string,
): Promise<string> {
  const sessionDir = join(root, 'sessions', sessionId);
  mkdirSync(sessionDir, { recursive: true });
  const filePath = join(sessionDir, filename);
  writeFileSync(filePath, Buffer.from(base64, 'base64'));
  return filePath;
}

export function deleteSessionDir(root: string, sessionId: string): void {
  rmSync(join(root, 'sessions', sessionId), { recursive: true, force: true });
}

export function assetExists(root: string, sessionId: string, filename: string): boolean {
  return existsSync(join(root, 'sessions', sessionId, filename));
}

export function assetPath(root: string, sessionId: string, filename: string): string {
  return join(root, 'sessions', sessionId, filename);
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd mcp-server && npm test
```

Expected: All storage tests PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/storage.ts mcp-server/tests/storage.test.ts
git commit -m "feat: filesystem storage layer for session assets"
```

---

### Task 5: HTTP ingest endpoint (POST /sessions)

**Files:**
- Create: `mcp-server/src/http.ts`
- Create: `mcp-server/tests/http.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// mcp-server/tests/http.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHttpApp } from '../src/http.js';
import { initDb } from '../src/db.js';
import { initStorage } from '../src/storage.js';
import { mkdtempSync, rmSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createServer } from 'http';
import type { Session } from '../src/types.js';

let root: string;
let dbPath: string;
let db: ReturnType<typeof initDb>;
let server: ReturnType<typeof createServer>;
let port: number;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'send2llm-http-test-'));
  dbPath = join(tmpdir(), `send2llm-http-${Date.now()}.db`);
  db = initDb(dbPath);
  initStorage(root);
  const app = createHttpApp(db, root);
  server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      port = (server.address() as any).port;
      resolve();
    });
  });
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
  unlinkSync(dbPath);
  rmSync(root, { recursive: true, force: true });
});

function makeSession(): Session {
  return {
    id: `session-${Date.now()}`,
    url: 'https://example.com',
    pageTitle: 'Test',
    capturedAt: new Date().toISOString(),
    fullPageScreenshotPath: '',
    annotations: [{
      id: 'ann-1', number: 1, type: 'task', note: 'Fix this',
      selector: 'div', elementHTML: '<div/>', elementScreenshotPath: '',
      boundingBox: { x: 0, y: 0, width: 10, height: 10 },
      createdAt: new Date().toISOString(),
    }],
    consoleLogs: [],
    sessionStorage: {},
  };
}

describe('POST /sessions', () => {
  it('accepts a session payload and returns 201', async () => {
    const session = makeSession();
    const res = await fetch(`http://localhost:${port}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session, fullPageScreenshotBase64: null, elementScreenshots: {} }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { id: string };
    expect(body.id).toBe(session.id);
  });

  it('rejects payload missing session field with 400', async () => {
    const res = await fetch(`http://localhost:${port}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notSession: true }),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd mcp-server && npm test
```

Expected: FAIL — Cannot find module '../src/http.js'

- [ ] **Step 3: Implement http.ts**

```typescript
// mcp-server/src/http.ts
import express, { type Express } from 'express';
import type { Db } from './db.js';
import { insertSession } from './db.js';
import { saveBase64Asset } from './storage.js';
import type { Session } from './types.js';

export function createHttpApp(db: Db, storageRoot: string): Express {
  const app = express();
  app.use(express.json({ limit: '200mb' }));

  app.post('/sessions', async (req, res) => {
    const { session, fullPageScreenshotBase64, elementScreenshots } = req.body as {
      session?: Session;
      fullPageScreenshotBase64?: string | null;
      elementScreenshots?: Record<string, string>;
    };

    if (!session || !session.id) {
      res.status(400).json({ error: 'Missing session' });
      return;
    }

    try {
      if (fullPageScreenshotBase64) {
        session.fullPageScreenshotPath = await saveBase64Asset(
          storageRoot, session.id, 'full-page.png', fullPageScreenshotBase64,
        );
      }
      if (elementScreenshots) {
        for (const [annotationId, base64] of Object.entries(elementScreenshots)) {
          const ann = session.annotations.find((a) => a.id === annotationId);
          if (ann && base64) {
            ann.elementScreenshotPath = await saveBase64Asset(
              storageRoot, session.id, `element-${ann.number}.png`, base64,
            );
          }
        }
      }
      insertSession(db, session);
      res.status(201).json({ id: session.id });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  return app;
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd mcp-server && npm test
```

Expected: All http tests PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/http.ts mcp-server/tests/http.test.ts
git commit -m "feat: HTTP ingest endpoint POST /sessions"
```

---

### Task 6: MCP tools

**Files:**
- Create: `mcp-server/src/tools/list-sessions.ts`
- Create: `mcp-server/src/tools/load-session.ts`
- Create: `mcp-server/src/tools/get-annotations.ts`
- Create: `mcp-server/src/tools/get-annotation.ts`
- Create: `mcp-server/src/tools/get-screenshot.ts`
- Create: `mcp-server/src/tools/get-console-logs.ts`
- Create: `mcp-server/src/tools/get-session-storage.ts`
- Create: `mcp-server/src/tools/get-recording.ts`
- Create: `mcp-server/src/tools/delete-annotation.ts`
- Create: `mcp-server/tests/tools.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// mcp-server/tests/tools.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDb, insertSession } from '../src/db.js';
import { initStorage } from '../src/storage.js';
import { handleListSessions } from '../src/tools/list-sessions.js';
import { handleLoadSession } from '../src/tools/load-session.js';
import { handleGetAnnotations } from '../src/tools/get-annotations.js';
import { handleGetAnnotation } from '../src/tools/get-annotation.js';
import { handleGetScreenshot } from '../src/tools/get-screenshot.js';
import { handleGetConsoleLogs } from '../src/tools/get-console-logs.js';
import { handleGetSessionStorage } from '../src/tools/get-session-storage.js';
import { handleDeleteAnnotation } from '../src/tools/delete-annotation.js';
import { mkdtempSync, rmSync, unlinkSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Session } from '../src/types.js';

let root: string;
let dbPath: string;
let db: ReturnType<typeof initDb>;

function makeSession(id = 'sess-1'): Session {
  return {
    id, url: 'https://example.com', pageTitle: 'Example',
    capturedAt: '2026-04-22T10:00:00Z',
    fullPageScreenshotPath: join(root, 'sessions', id, 'full-page.png'),
    annotations: [
      { id: 'a1', number: 1, type: 'task', note: 'Fix button', selector: 'button', elementHTML: '<button/>',
        elementScreenshotPath: join(root, 'sessions', id, 'element-1.png'),
        boundingBox: { x: 0, y: 0, width: 10, height: 10 }, createdAt: '2026-04-22T10:00:01Z' },
      { id: 'a2', number: 2, type: 'bug', note: 'Header broken', selector: 'header', elementHTML: '<header/>',
        elementScreenshotPath: join(root, 'sessions', id, 'element-2.png'),
        boundingBox: { x: 0, y: 0, width: 200, height: 60 }, createdAt: '2026-04-22T10:00:02Z' },
    ],
    consoleLogs: [{ level: 'error', message: 'TypeError', timestamp: '2026-04-22T10:00:03Z' }],
    sessionStorage: { theme: 'dark', token: 'abc' },
  };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'send2llm-tools-test-'));
  dbPath = join(tmpdir(), `send2llm-tools-${Date.now()}.db`);
  db = initDb(dbPath);
  initStorage(root);
  const s = makeSession();
  mkdirSync(join(root, 'sessions', s.id), { recursive: true });
  writeFileSync(s.fullPageScreenshotPath, 'fake-png');
  writeFileSync(s.annotations[0].elementScreenshotPath, 'fake-elem-1');
  insertSession(db, s);
});

afterEach(() => {
  db.close();
  unlinkSync(dbPath);
  rmSync(root, { recursive: true, force: true });
});

describe('handleListSessions', () => {
  it('returns numbered session list', () => {
    const result = handleListSessions(db);
    expect(result).toContain('1.');
    expect(result).toContain('https://example.com');
    expect(result).toContain('2 annotation');
  });
});

describe('handleLoadSession', () => {
  it('loads session by number', () => {
    const result = handleLoadSession(db, '1');
    expect(result).toContain('https://example.com');
    expect(result).toContain('Fix button');
  });
  it('loads session by id', () => {
    expect(handleLoadSession(db, 'sess-1')).toContain('https://example.com');
  });
  it('returns not found for unknown', () => {
    expect(handleLoadSession(db, '999')).toContain('not found');
  });
});

describe('handleGetAnnotations', () => {
  it('returns all annotations', () => {
    const result = handleGetAnnotations(db, 'sess-1');
    expect(result).toContain('#1');
    expect(result).toContain('#2');
    expect(result).toContain('Fix button');
    expect(result).toContain('Header broken');
  });
});

describe('handleGetAnnotation', () => {
  it('returns annotation #1', () => {
    const result = handleGetAnnotation(db, 'sess-1', 1);
    expect(result).toContain('Fix button');
    expect(result).toContain('element-1.png');
  });
  it('returns not found for #99', () => {
    expect(handleGetAnnotation(db, 'sess-1', 99)).toContain('not found');
  });
});

describe('handleGetScreenshot', () => {
  it('returns full-page screenshot path', () => {
    expect(handleGetScreenshot(db, 'sess-1')).toContain('full-page.png');
  });
});

describe('handleGetConsoleLogs', () => {
  it('returns formatted logs', () => {
    const result = handleGetConsoleLogs(db, 'sess-1');
    expect(result).toContain('[error]');
    expect(result).toContain('TypeError');
  });
});

describe('handleGetSessionStorage', () => {
  it('returns key-value pairs', () => {
    const result = handleGetSessionStorage(db, 'sess-1');
    expect(result).toContain('theme');
    expect(result).toContain('dark');
  });
});

describe('handleDeleteAnnotation', () => {
  it('deletes annotation #1 and confirms', () => {
    const result = handleDeleteAnnotation(db, 'sess-1', 1);
    expect(result).toContain('deleted');
    expect(handleGetAnnotation(db, 'sess-1', 1)).toContain('not found');
  });
  it('returns not found for non-existent', () => {
    expect(handleDeleteAnnotation(db, 'sess-1', 99)).toContain('not found');
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd mcp-server && npm test
```

Expected: FAIL — multiple Cannot find module errors.

- [ ] **Step 3: Implement list-sessions.ts**

```typescript
// mcp-server/src/tools/list-sessions.ts
import type { Db } from '../db.js';
import { listSessions } from '../db.js';

export function handleListSessions(db: Db): string {
  const sessions = listSessions(db);
  if (sessions.length === 0) return 'No sessions found.';
  return sessions
    .map((s) => `${s.number}. ${s.capturedAt} — ${s.url} (${s.annotationCount} annotation${s.annotationCount !== 1 ? 's' : ''})`)
    .join('\n');
}
```

- [ ] **Step 4: Implement load-session.ts**

```typescript
// mcp-server/src/tools/load-session.ts
import type { Db } from '../db.js';
import { getSessionById, getSessionByNumber } from '../db.js';
import type { Session } from '../types.js';

export function handleLoadSession(db: Db, idOrNumber: string): string {
  const n = parseInt(idOrNumber, 10);
  const session: Session | null = isNaN(n) ? getSessionById(db, idOrNumber) : getSessionByNumber(db, n);
  if (!session) return `Session "${idOrNumber}" not found.`;

  const lines = [
    `# Session: ${session.pageTitle}`,
    `URL: ${session.url}`,
    `Captured: ${session.capturedAt}`,
    `Full-page screenshot: ${session.fullPageScreenshotPath}`,
    ``,
    `## Annotations (${session.annotations.length})`,
    ...session.annotations.map((a) => `  #${a.number} [${a.type.toUpperCase()}] ${a.note} — ${a.selector}`),
    ``,
    `## Console Logs (${session.consoleLogs.length})`,
    ...session.consoleLogs.map((l) => `  [${l.level}] ${l.timestamp} ${l.message}`),
    ``,
    `## Session Storage`,
    ...Object.entries(session.sessionStorage).map(([k, v]) => `  ${k}: ${v}`),
  ];
  if (session.recording) {
    lines.push(``, `## Recording`, `  ${session.recording.path} (${session.recording.durationMs}ms)`);
  }
  return lines.join('\n');
}
```

- [ ] **Step 5: Implement get-annotations.ts**

```typescript
// mcp-server/src/tools/get-annotations.ts
import type { Db } from '../db.js';
import { getSessionById } from '../db.js';

export function handleGetAnnotations(db: Db, sessionId: string): string {
  const session = getSessionById(db, sessionId);
  if (!session) return `Session "${sessionId}" not found.`;
  if (session.annotations.length === 0) return 'No annotations in this session.';
  return session.annotations.map((a) =>
    [`#${a.number} [${a.type.toUpperCase()}]`, `  Note: ${a.note}`, `  Selector: ${a.selector}`,
     `  Screenshot: ${a.elementScreenshotPath}`, `  Created: ${a.createdAt}`].join('\n')
  ).join('\n\n');
}
```

- [ ] **Step 6: Implement get-annotation.ts**

```typescript
// mcp-server/src/tools/get-annotation.ts
import type { Db } from '../db.js';
import { getAnnotationByNumber, getSessionById } from '../db.js';

export function handleGetAnnotation(db: Db, sessionId: string, number: number): string {
  const session = getSessionById(db, sessionId);
  if (!session) return `Session "${sessionId}" not found.`;
  const ann = getAnnotationByNumber(db, sessionId, number);
  if (!ann) return `Annotation #${number} not found in session "${sessionId}".`;
  return [
    `#${ann.number} [${ann.type.toUpperCase()}]`,
    `Note: ${ann.note}`,
    `Selector: ${ann.selector}`,
    `Element HTML: ${ann.elementHTML}`,
    `Screenshot: ${ann.elementScreenshotPath}`,
    `Bounding Box: x=${ann.boundingBox.x} y=${ann.boundingBox.y} w=${ann.boundingBox.width} h=${ann.boundingBox.height}`,
    `Created: ${ann.createdAt}`,
  ].join('\n');
}
```

- [ ] **Step 7: Implement get-screenshot.ts**

```typescript
// mcp-server/src/tools/get-screenshot.ts
import type { Db } from '../db.js';
import { getSessionById } from '../db.js';

export function handleGetScreenshot(db: Db, sessionId: string): string {
  const session = getSessionById(db, sessionId);
  if (!session) return `Session "${sessionId}" not found.`;
  return `Full-page screenshot: ${session.fullPageScreenshotPath}`;
}
```

- [ ] **Step 8: Implement get-console-logs.ts**

```typescript
// mcp-server/src/tools/get-console-logs.ts
import type { Db } from '../db.js';
import { getSessionById } from '../db.js';

export function handleGetConsoleLogs(db: Db, sessionId: string): string {
  const session = getSessionById(db, sessionId);
  if (!session) return `Session "${sessionId}" not found.`;
  if (session.consoleLogs.length === 0) return 'No console logs captured.';
  return session.consoleLogs.map((l) => `[${l.level}] ${l.timestamp} — ${l.message}`).join('\n');
}
```

- [ ] **Step 9: Implement get-session-storage.ts**

```typescript
// mcp-server/src/tools/get-session-storage.ts
import type { Db } from '../db.js';
import { getSessionById } from '../db.js';

export function handleGetSessionStorage(db: Db, sessionId: string): string {
  const session = getSessionById(db, sessionId);
  if (!session) return `Session "${sessionId}" not found.`;
  const entries = Object.entries(session.sessionStorage);
  if (entries.length === 0) return 'Session storage is empty.';
  return entries.map(([k, v]) => `${k}: ${v}`).join('\n');
}
```

- [ ] **Step 10: Implement get-recording.ts**

```typescript
// mcp-server/src/tools/get-recording.ts
import type { Db } from '../db.js';
import { getSessionById } from '../db.js';

export function handleGetRecording(db: Db, sessionId: string): string {
  const session = getSessionById(db, sessionId);
  if (!session) return `Session "${sessionId}" not found.`;
  if (!session.recording) return 'No recording for this session.';
  return [`File: ${session.recording.path}`, `Duration: ${session.recording.durationMs}ms`,
          `Sources: ${session.recording.sources.join(', ')}`].join('\n');
}
```

- [ ] **Step 11: Implement delete-annotation.ts**

```typescript
// mcp-server/src/tools/delete-annotation.ts
import type { Db } from '../db.js';
import { deleteAnnotation } from '../db.js';

export function handleDeleteAnnotation(db: Db, sessionId: string, number: number): string {
  const deleted = deleteAnnotation(db, sessionId, number);
  if (!deleted) return `Annotation #${number} not found in session "${sessionId}".`;
  return `Annotation #${number} deleted from session "${sessionId}".`;
}
```

- [ ] **Step 12: Run tests — verify they pass**

```bash
cd mcp-server && npm test
```

Expected: All tool tests PASS.

- [ ] **Step 13: Commit**

```bash
git add mcp-server/src/tools/ mcp-server/tests/tools.test.ts
git commit -m "feat: MCP tools for session query and annotation delete"
```

---

### Task 7: Entry point — wire HTTP + MCP server

**Files:**
- Create: `mcp-server/src/index.ts`

- [ ] **Step 1: Implement index.ts**

```typescript
// mcp-server/src/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { homedir } from 'os';
import { join } from 'path';
import { initDb } from './db.js';
import { initStorage } from './storage.js';
import { createHttpApp } from './http.js';
import { handleListSessions } from './tools/list-sessions.js';
import { handleLoadSession } from './tools/load-session.js';
import { handleGetAnnotations } from './tools/get-annotations.js';
import { handleGetAnnotation } from './tools/get-annotation.js';
import { handleGetScreenshot } from './tools/get-screenshot.js';
import { handleGetConsoleLogs } from './tools/get-console-logs.js';
import { handleGetSessionStorage } from './tools/get-session-storage.js';
import { handleGetRecording } from './tools/get-recording.js';
import { handleDeleteAnnotation } from './tools/delete-annotation.js';

const STORAGE_ROOT = process.env.SEND2LLM_DIR ?? join(homedir(), '.send2llm');
const HTTP_PORT = parseInt(process.env.SEND2LLM_PORT ?? '3579', 10);

const db = initDb(join(STORAGE_ROOT, 'sessions.db'));
initStorage(STORAGE_ROOT);

const app = createHttpApp(db, STORAGE_ROOT);
app.listen(HTTP_PORT, () => {
  process.stderr.write(`Send2LLM HTTP server listening on port ${HTTP_PORT}\n`);
});

const mcpServer = new Server(
  { name: 'send2llm', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: 'list_sessions', description: 'List all captured sessions', inputSchema: { type: 'object' as const, properties: {} } },
    { name: 'load_session', description: 'Load a session by number or ID', inputSchema: { type: 'object' as const, properties: { id: { type: 'string' } }, required: ['id'] } },
    { name: 'get_annotations', description: 'Get all annotations for a session', inputSchema: { type: 'object' as const, properties: { session_id: { type: 'string' } }, required: ['session_id'] } },
    { name: 'get_annotation', description: 'Get a single annotation by number', inputSchema: { type: 'object' as const, properties: { session_id: { type: 'string' }, number: { type: 'number' } }, required: ['session_id', 'number'] } },
    { name: 'get_screenshot', description: 'Get full-page screenshot path', inputSchema: { type: 'object' as const, properties: { session_id: { type: 'string' } }, required: ['session_id'] } },
    { name: 'get_console_logs', description: 'Get console logs for a session', inputSchema: { type: 'object' as const, properties: { session_id: { type: 'string' } }, required: ['session_id'] } },
    { name: 'get_session_storage', description: 'Get sessionStorage for a session', inputSchema: { type: 'object' as const, properties: { session_id: { type: 'string' } }, required: ['session_id'] } },
    { name: 'get_recording', description: 'Get recording file path', inputSchema: { type: 'object' as const, properties: { session_id: { type: 'string' } }, required: ['session_id'] } },
    { name: 'delete_annotation', description: 'Delete annotation by number (e.g. delete 2)', inputSchema: { type: 'object' as const, properties: { session_id: { type: 'string' }, number: { type: 'number' } }, required: ['session_id', 'number'] } },
  ],
}));

mcpServer.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  let text: string;
  switch (name) {
    case 'list_sessions': text = handleListSessions(db); break;
    case 'load_session': text = handleLoadSession(db, args!.id as string); break;
    case 'get_annotations': text = handleGetAnnotations(db, args!.session_id as string); break;
    case 'get_annotation': text = handleGetAnnotation(db, args!.session_id as string, args!.number as number); break;
    case 'get_screenshot': text = handleGetScreenshot(db, args!.session_id as string); break;
    case 'get_console_logs': text = handleGetConsoleLogs(db, args!.session_id as string); break;
    case 'get_session_storage': text = handleGetSessionStorage(db, args!.session_id as string); break;
    case 'get_recording': text = handleGetRecording(db, args!.session_id as string); break;
    case 'delete_annotation': text = handleDeleteAnnotation(db, args!.session_id as string, args!.number as number); break;
    default: text = `Unknown tool: ${name}`;
  }
  return { content: [{ type: 'text' as const, text }] };
});

const transport = new StdioServerTransport();
await mcpServer.connect(transport);
```

- [ ] **Step 2: Build and verify no TypeScript errors**

```bash
cd mcp-server && npm run build
```

Expected: dist/index.js created, zero errors.

- [ ] **Step 3: Smoke test**

```bash
cd mcp-server && node dist/index.js &
sleep 1
curl -s -X POST http://localhost:3579/sessions \
  -H 'Content-Type: application/json' \
  -d '{"session":{"id":"smoke-1","url":"https://example.com","pageTitle":"Test","capturedAt":"2026-04-22T10:00:00Z","fullPageScreenshotPath":"","annotations":[],"consoleLogs":[],"sessionStorage":{}}}'
kill %1
```

Expected output: {"id":"smoke-1"}

- [ ] **Step 4: Commit**

```bash
git add mcp-server/src/index.ts
git commit -m "feat: wire MCP + HTTP server entry point"
```

---

### Task 8: MCP server README

**Files:**
- Create: `mcp-server/README.md`

- [ ] **Step 1: Write README**

Content:

```
# Send2LLM MCP Server

Local MCP server that receives sessions from the Send2LLM browser extension.

## Install & Build

  cd mcp-server && npm install && npm run build

## Configure in Claude Code (~/.claude/config.json)

  {
    "mcpServers": {
      "send2llm": {
        "command": "node",
        "args": ["/absolute/path/to/send2llm/mcp-server/dist/index.js"]
      }
    }
  }

## Environment Variables

  SEND2LLM_DIR   — storage root (default: ~/.send2llm)
  SEND2LLM_PORT  — HTTP port (default: 3579)

## Tools

  list_sessions()
  load_session(id)
  get_annotations(session_id)
  get_annotation(session_id, number)
  get_screenshot(session_id)
  get_console_logs(session_id)
  get_session_storage(session_id)
  get_recording(session_id)
  delete_annotation(session_id, number)
```

- [ ] **Step 2: Commit**

```bash
git add mcp-server/README.md
git commit -m "docs: MCP server setup and tool reference"
```
