import type { Annotation, BoundingBox } from '../../shared/types.js';

type AnnotationType = Annotation['type'];

export interface PopoverOptions {
  anchorRect?: DOMRect | { top: number; left: number; bottom: number; right: number; width: number; height: number };
  highlightBox?: BoundingBox;
}

export function showPopover(
  anchorEl: Element,
  annotationNumber: number,
  onAdd: (partial: Pick<Annotation, 'type' | 'note'>) => void,
  onCancel: () => void,
  options: PopoverOptions = {},
): void {
  const existing = document.getElementById('s2l-popover-host');
  if (existing) existing.remove();
  const existingHl = document.getElementById('s2l-region-highlight');
  if (existingHl) existingHl.remove();

  const host = document.createElement('div');
  host.id = 's2l-popover-host';
  const shadow = host.attachShadow({ mode: 'open' });

  const styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = chrome.runtime.getURL('content/sidebar/sidebar.css');
  shadow.appendChild(styleLink);

  // Optional region highlight overlay
  let highlight: HTMLDivElement | null = null;
  if (options.highlightBox) {
    const box = options.highlightBox;
    highlight = document.createElement('div');
    highlight.id = 's2l-region-highlight';
    Object.assign(highlight.style, {
      position: 'absolute',
      left: `${box.x}px`,
      top: `${box.y}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
      border: '2px solid #f97316',
      borderRadius: '4px',
      background: 'rgba(249,115,22,0.12)',
      boxShadow: '0 0 0 9999px rgba(0,0,0,0.18)',
      pointerEvents: 'none',
      zIndex: '2147483646',
      transition: 'opacity 0.2s ease',
    } as CSSStyleDeclaration);
    document.body.appendChild(highlight);
    // Scroll the region into view, then place popover relative to current scroll
    const targetScrollY = Math.max(0, box.y - 80);
    window.scrollTo({ top: targetScrollY, behavior: 'smooth' });
  }

  const anchor = options.anchorRect ?? anchorEl.getBoundingClientRect();
  let selectedType: AnnotationType = 'task';

  const types: AnnotationType[] = ['task', 'bug', 'comment', 'request'];

  const popover = document.createElement('div');
  popover.className = 's2l-popover';
  // Position in viewport coords (popover is position:fixed)
  const popWidth = 300;
  const popHeight = 220;
  let popLeft = anchor.left;
  let popTop = anchor.bottom + 8;
  if (popLeft + popWidth > window.innerWidth - 12) popLeft = window.innerWidth - popWidth - 12;
  if (popLeft < 12) popLeft = 12;
  if (popTop + popHeight > window.innerHeight - 12) popTop = Math.max(12, anchor.top - popHeight - 8);
  popover.style.top = `${popTop}px`;
  popover.style.left = `${popLeft}px`;

  const numLabel = document.createElement('div');
  numLabel.style.cssText = 'font-size:11px;color:#86868b;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;margin-bottom:8px;';
  numLabel.textContent = `Annotation #${annotationNumber}`;

  const typeRow = document.createElement('div');
  typeRow.className = 's2l-type-row';

  for (const t of types) {
    const btn = document.createElement('button');
    btn.className = `s2l-type-btn${t === 'task' ? ' selected' : ''}`;
    btn.dataset.type = t;
    btn.textContent = t;
    btn.addEventListener('click', () => {
      shadow.querySelectorAll('.s2l-type-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedType = t;
    });
    typeRow.appendChild(btn);
  }

  const textarea = document.createElement('textarea');
  textarea.className = 's2l-note-input';
  textarea.placeholder = 'Describe the annotation\u2026';

  const actions = document.createElement('div');
  actions.className = 's2l-popover-actions';

  const cleanup = (): void => {
    host.remove();
    highlight?.remove();
    document.removeEventListener('keydown', onKey, true);
  };

  const onKey = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') { ev.stopPropagation(); cleanup(); onCancel(); }
    if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
      ev.preventDefault();
      addBtn.click();
    }
  };
  document.addEventListener('keydown', onKey, true);

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 's2l-btn-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => { cleanup(); onCancel(); });

  const addBtn = document.createElement('button');
  addBtn.className = 's2l-btn-add';
  addBtn.textContent = 'Add';
  addBtn.addEventListener('click', () => {
    const note = textarea.value.trim();
    if (!note) return;
    cleanup();
    onAdd({ type: selectedType, note });
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(addBtn);

  popover.appendChild(numLabel);
  popover.appendChild(typeRow);
  popover.appendChild(textarea);
  popover.appendChild(actions);

  shadow.appendChild(popover);
  document.body.appendChild(host);
  textarea.focus();
}
