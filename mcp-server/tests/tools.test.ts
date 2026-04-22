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
