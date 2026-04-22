import type { Db } from '../db.js';
import { getAnnotationByNumber, getSessionById } from '../db.js';

export function handleGetAnnotation(db: Db, sessionId: string, number: number): string {
  const session = getSessionById(db, sessionId);
  if (!session) return `Session "${sessionId}" not found.`;
  const ann = getAnnotationByNumber(db, sessionId, number);
  if (!ann) return `Annotation #${number} not found in session "${sessionId}".`;
  return [
    `#${ann.number} [${ann.type.toUpperCase()}]`,
    `Note: ${ann.note}`,
    `Selector: ${ann.selector}`,
    `Element HTML: ${ann.elementHTML}`,
    `Screenshot: ${ann.elementScreenshotPath}`,
    `Bounding Box: x=${ann.boundingBox.x} y=${ann.boundingBox.y} w=${ann.boundingBox.width} h=${ann.boundingBox.height}`,
    `Created: ${ann.createdAt}`,
  ].join('\n');
}
