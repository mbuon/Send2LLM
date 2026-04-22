import type { Db } from '../db.js';
import { getSessionById } from '../db.js';

export function handleGetScreenshot(db: Db, sessionId: string): string {
  const session = getSessionById(db, sessionId);
  if (!session) return `Session "${sessionId}" not found.`;
  return `Full-page screenshot: ${session.fullPageScreenshotPath}`;
}
