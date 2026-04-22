import type { Db } from '../db.js';
import { getSessionById } from '../db.js';

export function handleGetConsoleLogs(db: Db, sessionId: string): string {
  const session = getSessionById(db, sessionId);
  if (!session) return `Session "${sessionId}" not found.`;
  if (session.consoleLogs.length === 0) return 'No console logs captured.';
  return session.consoleLogs.map((l) => `[${l.level}] ${l.timestamp} — ${l.message}`).join('\n');
}
