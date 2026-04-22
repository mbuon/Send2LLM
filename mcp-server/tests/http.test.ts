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
