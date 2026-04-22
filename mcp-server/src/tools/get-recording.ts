import type { Db } from '../db.js';
import { getSessionById } from '../db.js';

export function handleGetRecording(db: Db, sessionId: string): string {
  const session = getSessionById(db, sessionId);
  if (!session) return `Session "${sessionId}" not found.`;
  if (!session.recording) return 'No recording for this session.';
  return [`File: ${session.recording.path}`, `Duration: ${session.recording.durationMs}ms`,
          `Sources: ${session.recording.sources.join(', ')}`].join('\n');
}
