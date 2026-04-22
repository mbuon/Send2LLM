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
    `).run(`${session.id}:${ann.id}`, session.id, ann.number, ann.type, ann.note, ann.selector,
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
      id: a.id.includes(':') ? a.id.slice(a.id.indexOf(':') + 1) : a.id,
      number: a.number, type: a.type, note: a.note, selector: a.selector,
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
    id: row.id.includes(':') ? row.id.slice(row.id.indexOf(':') + 1) : row.id,
    number: row.number, type: row.type, note: row.note, selector: row.selector,
    elementHTML: row.element_html, elementScreenshotPath: row.element_screenshot_path,
    boundingBox: JSON.parse(row.bounding_box), createdAt: row.created_at,
  };
}

export function deleteAnnotation(db: Db, sessionId: string, number: number): boolean {
  const result = db.prepare('DELETE FROM annotations WHERE session_id = ? AND number = ?').run(sessionId, number);
  return result.changes > 0;
}
