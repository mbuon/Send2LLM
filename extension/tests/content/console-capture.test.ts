import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startConsoleCapture, getConsoleLogs, clearConsoleLogs } from '../../src/content/console-capture.js';

beforeEach(() => {
  clearConsoleLogs();
  startConsoleCapture();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('startConsoleCapture', () => {
  it('captures console.log entries', () => {
    console.log('hello world');
    const logs = getConsoleLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe('log');
    expect(logs[0].message).toContain('hello world');
    expect(logs[0].timestamp).toBeTruthy();
  });

  it('captures console.error entries', () => {
    console.error('something broke');
    const logs = getConsoleLogs();
    expect(logs.some((l) => l.level === 'error')).toBe(true);
  });

  it('does not double-capture on second call', () => {
    startConsoleCapture();
    console.log('once');
    expect(getConsoleLogs().filter((l) => l.message.includes('once'))).toHaveLength(1);
  });
});

describe('clearConsoleLogs', () => {
  it('empties the buffer', () => {
    console.log('test');
    clearConsoleLogs();
    expect(getConsoleLogs()).toHaveLength(0);
  });
});
