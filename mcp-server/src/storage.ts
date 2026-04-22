// mcp-server/src/storage.ts
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface StorageInit {
  sessionsDir: string;
}

export function initStorage(root: string): StorageInit {
  const sessionsDir = join(root, 'sessions');
  mkdirSync(sessionsDir, { recursive: true });
  return { sessionsDir };
}

export async function saveBase64Asset(
  root: string, sessionId: string, filename: string, base64: string,
): Promise<string> {
  const sessionDir = join(root, 'sessions', sessionId);
  mkdirSync(sessionDir, { recursive: true });
  const filePath = join(sessionDir, filename);
  writeFileSync(filePath, Buffer.from(base64, 'base64'));
  return filePath;
}

export function deleteSessionDir(root: string, sessionId: string): void {
  rmSync(join(root, 'sessions', sessionId), { recursive: true, force: true });
}

export function assetExists(root: string, sessionId: string, filename: string): boolean {
  return existsSync(join(root, 'sessions', sessionId, filename));
}

export function assetPath(root: string, sessionId: string, filename: string): string {
  return join(root, 'sessions', sessionId, filename);
}
