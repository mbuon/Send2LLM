import { describe, it, expect } from 'vitest';
import { generateId, formatDate, buildCssSelector } from '../../src/shared/utils.js';

describe('generateId', () => {
  it('returns a non-empty string', () => {
    expect(typeof generateId()).toBe('string');
    expect(generateId().length).toBeGreaterThan(0);
  });
  it('returns unique values', () => {
    expect(generateId()).not.toBe(generateId());
  });
});

describe('formatDate', () => {
  it('formats an ISO string to readable date', () => {
    const result = formatDate('2026-04-22T14:30:00Z');
    expect(result).toContain('2026');
    expect(result).toContain('14:30');
  });
});

describe('buildCssSelector', () => {
  it('uses id if present', () => {
    const el = { id: 'login-btn', tagName: 'BUTTON', className: '', parentElement: null } as any;
    expect(buildCssSelector(el)).toBe('button#login-btn');
  });

  it('uses tag + nth-child when no id', () => {
    const parent = { children: [] as Element[] } as any;
    const el = {
      id: '',
      tagName: 'DIV',
      className: 'card',
      classList: { length: 1, [Symbol.iterator]: (['card'] as string[])[Symbol.iterator].bind(['card']) },
      parentElement: parent
    } as any;
    parent.children = [el];
    const result = buildCssSelector(el);
    expect(result).toContain('div');
    expect(result).toContain('card');
  });
});
