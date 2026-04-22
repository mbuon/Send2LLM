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
