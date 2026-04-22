import type { Db } from '../db.js';
import { listSessions } from '../db.js';

export function handleListSessions(db: Db): string {
  const sessions = listSessions(db);
  if (sessions.length === 0) return 'No sessions found.';
  return sessions
    .map((s) => `${s.number}. ${s.capturedAt} — ${s.url} (${s.annotationCount} annotation${s.annotationCount !== 1 ? 's' : ''})`)
    .join('\n');
}
