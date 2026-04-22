import type { Annotation } from '../../shared/types.js';

type AnnotationType = Annotation['type'];

export function showPopover(
  anchorEl: Element,
  annotationNumber: number,
  onAdd: (partial: Pick<Annotation, 'type' | 'note'>) => void,
  onCancel: () => void,
): void {
  const existing = document.getElementById('s2l-popover-host');
  if (existing) existing.remove();

  const host = document.createElement('div');
  host.id = 's2l-popover-host';
  const shadow = host.attachShadow({ mode: 'open' });

  const rect = anchorEl.getBoundingClientRect();
  let selectedType: AnnotationType = 'task';

  const types: AnnotationType[] = ['task', 'bug', 'comment', 'request'];

  const popover = document.createElement('div');
  popover.className = 's2l-popover';
  popover.style.top = `${Math.min(rect.bottom + window.scrollY + 8, window.innerHeight - 200)}px`;
  popover.style.left = `${rect.left + window.scrollX}px`;

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

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 's2l-btn-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    host.remove();
    onCancel();
  });

  const addBtn = document.createElement('button');
  addBtn.className = 's2l-btn-add';
  addBtn.textContent = 'Add';
  addBtn.addEventListener('click', () => {
    const note = textarea.value.trim();
    if (!note) return;
    host.remove();
    onAdd({ type: selectedType, note });
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(addBtn);

  popover.appendChild(typeRow);
  popover.appendChild(textarea);
  popover.appendChild(actions);

  shadow.appendChild(popover);
  document.body.appendChild(host);
  textarea.focus();
}
