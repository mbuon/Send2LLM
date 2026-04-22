import type { Annotation } from '../../shared/types.js';

export function renderAnnotationList(
  annotations: Annotation[],
  onDelete: (id: string) => void,
  root: ShadowRoot,
): void {
  const container = root.getElementById('s2l-annotation-list')!;
  container.innerHTML = '';

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

    item.appendChild(badge);
    item.appendChild(note);
    item.appendChild(del);
    container.appendChild(item);
  }
}
