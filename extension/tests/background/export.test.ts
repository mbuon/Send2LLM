import { describe, it, expect } from 'vitest';
import { buildMarkdown, buildZip } from '../../src/background/export.js';
import type { Session } from '../../src/shared/types.js';

function makeSession(): Session {
  return {
    id: 'sess-1',
    url: 'https://example.com',
    pageTitle: 'Example',
    capturedAt: '2026-04-22T10:00:00Z',
    fullPageScreenshotBase64: Buffer.from('fake-png').toString('base64'),
    fullPageScreenshotPath: '',
    annotations: [{
      id: 'a1', number: 1, type: 'task', note: 'Fix the button',
      selector: 'button#login', elementHTML: '<button/>',
      elementScreenshotBase64: Buffer.from('fake-elem').toString('base64'),
      elementScreenshotPath: '',
      boundingBox: { x: 0, y: 0, width: 10, height: 10 },
      createdAt: '2026-04-22T10:00:01Z',
    }],
    consoleLogs: [{ level: 'error', message: 'TypeError', timestamp: '2026-04-22T10:00:02Z' }],
    sessionStorage: { theme: 'dark' },
  };
}

describe('buildMarkdown', () => {
  it('includes URL and page title', () => {
    const md = buildMarkdown(makeSession());
    expect(md).toContain('https://example.com');
    expect(md).toContain('Example');
  });

  it('includes annotation note and type', () => {
    const md = buildMarkdown(makeSession());
    expect(md).toContain('TASK');
    expect(md).toContain('Fix the button');
  });

  it('includes console log', () => {
    const md = buildMarkdown(makeSession());
    expect(md).toContain('[error]');
    expect(md).toContain('TypeError');
  });

  it('includes sessionStorage', () => {
    const md = buildMarkdown(makeSession());
    expect(md).toContain('theme');
    expect(md).toContain('dark');
  });

  it('embeds full-page screenshot as base64 img', () => {
    const md = buildMarkdown(makeSession());
    expect(md).toContain('data:image/png;base64,');
  });
});

describe('buildZip', () => {
  it('returns a Blob', async () => {
    const blob = await buildZip(makeSession());
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });
});
