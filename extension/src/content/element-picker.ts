import { buildCssSelector } from '../shared/utils.js';
import type { BoundingBox } from '../shared/types.js';

const HIGHLIGHT_CLASS = 's2l-highlight';

let active = false;
let onPick: ((el: Element) => void) | null = null;

function addHighlightStyles(): void {
  if (document.getElementById('s2l-highlight-styles')) return;
  const style = document.createElement('style');
  style.id = 's2l-highlight-styles';
  style.textContent = `.${HIGHLIGHT_CLASS} { outline: 3px solid #f97316 !important; outline-offset: 2px !important; cursor: crosshair !important; }`;
  document.head.appendChild(style);
}

function onMouseOver(e: MouseEvent): void {
  (e.target as Element).classList.add(HIGHLIGHT_CLASS);
}

function onMouseOut(e: MouseEvent): void {
  (e.target as Element).classList.remove(HIGHLIGHT_CLASS);
}

function onClick(e: MouseEvent): void {
  e.preventDefault();
  e.stopPropagation();
  const el = e.target as Element;
  el.classList.remove(HIGHLIGHT_CLASS);
  stopPicker();
  onPick?.(el);
}

export function startPicker(callback: (el: Element) => void): void {
  if (active) return;
  active = true;
  onPick = callback;
  addHighlightStyles();
  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('mouseout', onMouseOut, true);
  document.addEventListener('click', onClick, true);
}

export function stopPicker(): void {
  active = false;
  onPick = null;
  document.removeEventListener('mouseover', onMouseOver, true);
  document.removeEventListener('mouseout', onMouseOut, true);
  document.removeEventListener('click', onClick, true);
  // Strip any leftover highlight class from the page
  document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((el) => el.classList.remove(HIGHLIGHT_CLASS));
}

export function getElementInfo(el: Element): { selector: string; elementHTML: string; boundingBox: BoundingBox } {
  const rect = el.getBoundingClientRect();
  return {
    selector: buildCssSelector(el),
    elementHTML: (el as HTMLElement).outerHTML.slice(0, 2000),
    boundingBox: {
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height,
    },
  };
}
