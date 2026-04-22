import type { ConsoleEntry } from '../shared/types.js';

const LEVELS = ['log', 'warn', 'error', 'info', 'debug'] as const;
type Level = typeof LEVELS[number];

let buffer: ConsoleEntry[] = [];
let installed = false;
const originals = new Map<Level, (...args: unknown[]) => void>();

export function startConsoleCapture(): void {
  if (installed) return;
  installed = true;

  for (const level of LEVELS) {
    const original = console[level].bind(console);
    originals.set(level, original);
    console[level] = (...args: unknown[]) => {
      buffer.push({
        level,
        message: args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '),
        timestamp: new Date().toISOString(),
      });
      original(...args);
    };
  }
}

export function getConsoleLogs(): ConsoleEntry[] {
  return [...buffer];
}

export function clearConsoleLogs(): void {
  buffer = [];
  if (installed) {
    for (const level of LEVELS) {
      const orig = originals.get(level);
      if (orig) console[level] = orig as typeof console[typeof level];
    }
    originals.clear();
    installed = false;
  }
}
