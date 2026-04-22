// mcp-server/tests/storage.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initStorage, saveBase64Asset, deleteSessionDir, assetExists } from '../src/storage.js';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'send2llm-storage-test-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('initStorage', () => {
  it('creates sessions directory', () => {
    const { sessionsDir } = initStorage(root);
    expect(existsSync(sessionsDir)).toBe(true);
  });
});

describe('saveBase64Asset', () => {
  it('writes a PNG file and returns absolute path', async () => {
    initStorage(root);
    const base64 = Buffer.from('fake-png-data').toString('base64');
    const path = await saveBase64Asset(root, 'session-1', 'full-page.png', base64);
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path).toString()).toBe('fake-png-data');
  });
});

describe('deleteSessionDir', () => {
  it('removes the session directory', async () => {
    initStorage(root);
    const base64 = Buffer.from('x').toString('base64');
    const filePath = await saveBase64Asset(root, 'session-del', 'full-page.png', base64);
    deleteSessionDir(root, 'session-del');
    expect(existsSync(filePath)).toBe(false);
  });
});

describe('assetExists', () => {
  it('returns true for existing file, false otherwise', async () => {
    initStorage(root);
    const base64 = Buffer.from('x').toString('base64');
    await saveBase64Asset(root, 's1', 'full-page.png', base64);
    expect(assetExists(root, 's1', 'full-page.png')).toBe(true);
    expect(assetExists(root, 's1', 'missing.png')).toBe(false);
  });
});
