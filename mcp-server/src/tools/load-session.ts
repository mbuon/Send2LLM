import type { Db } from '../db.js';
import { getSessionById, getSessionByNumber } from '../db.js';
import type { Session } from '../types.js';

export function handleLoadSession(db: Db, idOrNumber: string): string {
  const n = parseInt(idOrNumber, 10);
  const session: Session | null = isNaN(n) ? getSessionById(db, idOrNumber) : getSessionByNumber(db, n);
  if (!session) return `Session "${idOrNumber}" not found.`;

  const lines = [
    `# Session: ${session.pageTitle}`,
    `URL: ${session.url}`,
    `Captured: ${session.capturedAt}`,
    `Full-page screenshot: ${session.fullPageScreenshotPath}`,
    ``,
    `## Annotations (${session.annotations.length})`,
    ...session.annotations.map((a) => `  #${a.number} [${a.type.toUpperCase()}] ${a.note} — ${a.selector}`),
    ``,
    `## Console Logs (${session.consoleLogs.length})`,
    ...session.consoleLogs.map((l) => `  [${l.level}] ${l.timestamp} ${l.message}`),
    ``,
    `## Session Storage`,
    ...Object.entries(session.sessionStorage).map(([k, v]) => `  ${k}: ${v}`),
  ];
  if (session.recording) {
    lines.push(``, `## Recording`, `  ${session.recording.path} (${session.recording.durationMs}ms)`);
  }
  return lines.join('\n');
}
