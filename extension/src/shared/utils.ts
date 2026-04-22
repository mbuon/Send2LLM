export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  });
}

export function buildCssSelector(el: Element): string {
  if (el.id) return `${el.tagName.toLowerCase()}#${el.id}`;

  const classList = el.classList ?? { length: 0, [Symbol.iterator]: [][Symbol.iterator].bind([]) };
  const classes = Array.from(classList).slice(0, 2).join('.');
  const tag = el.tagName.toLowerCase();
  const base = classes ? `${tag}.${classes}` : tag;

  if (!el.parentElement) return base;
  const siblings = Array.from(el.parentElement.children);
  const index = siblings.indexOf(el) + 1;
  return `${base}:nth-child(${index})`;
}
