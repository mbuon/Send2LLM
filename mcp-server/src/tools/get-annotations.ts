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
