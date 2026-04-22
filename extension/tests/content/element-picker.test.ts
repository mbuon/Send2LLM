import { describe, it, expect } from 'vitest';
import { buildCssSelector } from '../../src/shared/utils.js';

// element-picker uses DOM events; test the selector builder and bounding box logic via utils
describe('buildCssSelector via utils', () => {
  it('prefers id selector', () => {
    const el = { id: 'hero', tagName: 'SECTION', className: '', parentElement: null } as any;
    expect(buildCssSelector(el)).toBe('section#hero');
  });

  it('falls back to tag + class', () => {
    const parent = { children: [] as Element[] } as any;
    const el = {
      id: '',
      tagName: 'BUTTON',
      className: 'btn primary',
      classList: { length: 2, [Symbol.iterator]: (['btn', 'primary'] as string[])[Symbol.iterator].bind(['btn', 'primary']) },
      parentElement: parent
    } as any;
    parent.children = [el];
    const result = buildCssSelector(el);
    expect(result).toContain('button');
    expect(result).toContain('btn');
  });
});
