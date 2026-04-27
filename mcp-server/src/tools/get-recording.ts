import type { Db } from '../db.js';
import { getSessionById } from '../db.js';

export function handleGetRecording(db: Db, sessionId: string, index?: number): string {
  const session = getSessionById(db, sessionId);
  if (!session) return `Session "${sessionId}" not found.`;
  const recs = session.recordings ?? [];
  if (recs.length === 0) return 'No recordings for this session.';

  const formatOne = (r: typeof recs[number], n: number): string =>
    [`#${n} File: ${r.path}`, `   Duration: ${r.durationMs}ms`,
     `   Sources: ${r.sources.join(', ')}`].join('\n');

  if (typeof index === 'number') {
    const r = recs[index - 1];
    if (!r) return `No recording #${index} (session has ${recs.length}).`;
    return formatOne(r, index);
  }
  return recs.map((r, i) => formatOne(r, i + 1)).join('\n\n');
}
