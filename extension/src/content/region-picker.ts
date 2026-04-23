import type { BoundingBox } from '../shared/types.js';

const OVERLAY_ID = 's2l-region-overlay';
const RECT_ID = 's2l-region-rect';

let active = false;
let onPick: ((box: BoundingBox) => void) | null = null;
let onCancel: (() => void) | null = null;
let startX = 0;
let startY = 0;
let overlay: HTMLDivElement | null = null;
let rect: HTMLDivElement | null = null;

function ensureOverlay(): void {
  overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    background: 'rgba(0,0,0,0.25)',
    cursor: 'crosshair',
    zIndex: '2147483646',
  } as CSSStyleDeclaration);

  rect = document.createElement('div');
  rect.id = RECT_ID;
  Object.assign(rect.style, {
    position: 'fixed',
    border: '2px dashed #f97316',
    background: 'rgba(249,115,22,0.15)',
    pointerEvents: 'none',
    display: 'none',
  } as CSSStyleDeclaration);

  overlay.appendChild(rect);
  document.body.appendChild(overlay);
}

function onMouseDown(e: MouseEvent): void {
  e.preventDefault();
  startX = e.clientX;
  startY = e.clientY;
  if (!rect) return;
  rect.style.left = `${startX}px`;
  rect.style.top = `${startY}px`;
  rect.style.width = '0px';
  rect.style.height = '0px';
  rect.style.display = 'block';
  overlay!.addEventListener('mousemove', onMouseMove);
  overlay!.addEventListener('mouseup', onMouseUp);
}

function onMouseMove(e: MouseEvent): void {
  if (!rect) return;
  const x = Math.min(e.clientX, startX);
  const y = Math.min(e.clientY, startY);
  const w = Math.abs(e.clientX - startX);
  const h = Math.abs(e.clientY - startY);
  rect.style.left = `${x}px`;
  rect.style.top = `${y}px`;
  rect.style.width = `${w}px`;
  rect.style.height = `${h}px`;
}

function onMouseUp(e: MouseEvent): void {
  if (!rect) return;
  const x = Math.min(e.clientX, startX);
  const y = Math.min(e.clientY, startY);
  const w = Math.abs(e.clientX - startX);
  const h = Math.abs(e.clientY - startY);

  const cb = onPick;
  const cancel = onCancel;
  cleanup();

  if (w < 5 || h < 5) {
    cancel?.();
    return;
  }

  cb?.({
    x: x + window.scrollX,
    y: y + window.scrollY,
    width: w,
    height: h,
  });
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    const cancel = onCancel;
    cleanup();
    cancel?.();
  }
}

function cleanup(): void {
  active = false;
  onPick = null;
  onCancel = null;
  overlay?.removeEventListener('mousedown', onMouseDown);
  overlay?.removeEventListener('mousemove', onMouseMove);
  overlay?.removeEventListener('mouseup', onMouseUp);
  document.removeEventListener('keydown', onKeyDown, true);
  overlay?.remove();
  overlay = null;
  rect = null;
}

export function startRegionPicker(
  onPickCb: (box: BoundingBox) => void,
  onCancelCb: () => void,
): void {
  if (active) return;
  active = true;
  onPick = onPickCb;
  onCancel = onCancelCb;
  ensureOverlay();
  overlay!.addEventListener('mousedown', onMouseDown);
  document.addEventListener('keydown', onKeyDown, true);
}

export function stopRegionPicker(): void {
  if (!active) return;
  const cancel = onCancel;
  cleanup();
  cancel?.();
}
