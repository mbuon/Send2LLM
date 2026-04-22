import type { Db } from '../db.js';
import { deleteAnnotation } from '../db.js';

export function handleDeleteAnnotation(db: Db, sessionId: string, number: number): string {
  const deleted = deleteAnnotation(db, sessionId, number);
  if (!deleted) return `Annotation #${number} not found in session "${sessionId}".`;
  return `Annotation #${number} deleted from session "${sessionId}".`;
}
