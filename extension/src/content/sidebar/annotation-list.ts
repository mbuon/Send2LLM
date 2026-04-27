import type { Annotation } from '../../shared/types.js';

function clearChildren(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function renderAnnotationList(
  annotations: Annotation[],
  onDelete: (id: string) => void,
  root: ShadowRoot,
): void {
  const container = root.getElementById('s2l-annotation-list')!;
  clearChildren(container);

  if (annotations.length === 0) {
    const empty = document.createElement('div');
    empty.className = 's2l-empty';
    empty.textContent = 'No annotations yet. Click Pick Element to start.';
    container.appendChild(empty);
    return;
  }

  for (const ann of annotations) {
    const item = document.createElement('div');
    item.className = 's2l-annotation-item';

    // Header row: badge + summary + delete
    const headerRow = document.createElement('div');
    headerRow.className = 's2l-ann-row';

    const badge = document.createElement('span');
    badge.className = `s2l-ann-badge ${ann.type}`;
    badge.textContent = ann.type;

    const note = document.createElement('span');
    note.className = 's2l-ann-note';
    note.textContent = `#${ann.number} ${ann.note}`;

    const del = document.createElement('button');
    del.className = 's2l-ann-delete';
    del.title = 'Delete annotation';
    del.textContent = '✕';
    del.addEventListener('click', () => onDelete(ann.id));

    headerRow.appendChild(badge);
    headerRow.appendChild(note);
    headerRow.appendChild(del);
    item.appendChild(headerRow);

    // Inline thumbnail of the picked element or region.
    if (ann.elementScreenshotBase64) {
      const thumbWrap = document.createElement('div');
      thumbWrap.className = 's2l-ann-thumb-wrap';
      const thumb = document.createElement('img');
      thumb.className = 's2l-ann-thumb';
      thumb.src = `data:image/png;base64,${ann.elementScreenshotBase64}`;
      thumb.alt = `Annotation #${ann.number}`;
      thumbWrap.appendChild(thumb);
      item.appendChild(thumbWrap);
    }

    container.appendChild(item);
  }
}
