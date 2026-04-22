import type { Db } from '../db.js';
import { getSessionById } from '../db.js';

export function handleGetSessionStorage(db: Db, sessionId: string): string {
  const session = getSessionById(db, sessionId);
  if (!session) return `Session "${sessionId}" not found.`;
  const entries = Object.entries(session.sessionStorage);
  if (entries.length === 0) return 'Session storage is empty.';
  return entries.map(([k, v]) => `${k}: ${v}`).join('\n');
}
