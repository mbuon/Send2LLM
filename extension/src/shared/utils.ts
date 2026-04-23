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

// --- Adapted from Obsidian Web Clipper (MIT, Copyright 2024 Obsidian). See NOTICES.md. ---

const EPHEMERAL_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'ref', 'source', 'src',
  'fbclid', 'gclid', 'dclid', 'msclkid', 'twclid',
  'mc_cid', 'mc_eid', '_ga', '_gl', 'si',
]);

export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    const params = new URLSearchParams(parsed.search);
    for (const key of [...params.keys()]) {
      if (EPHEMERAL_PARAMS.has(key)) params.delete(key);
    }
    parsed.search = params.toString();
    return parsed.toString();
  } catch {
    return url;
  }
}

export function isRestrictedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (/^(chrome|edge|about|moz-extension|chrome-extension):/i.test(u.protocol)) return true;
    if (u.hostname === 'addons.mozilla.org') return true;
    if (u.hostname === 'chrome.google.com' && u.pathname.startsWith('/webstore')) return true;
    if (u.hostname === 'chromewebstore.google.com') return true;
    if (u.hostname === 'microsoftedge.microsoft.com' && u.pathname.startsWith('/addons')) return true;
    return false;
  } catch {
    return false;
  }
}

export function getElementXPath(element: Node): string {
  if (element.nodeType === Node.DOCUMENT_NODE) return '';
  if (element.nodeType !== Node.ELEMENT_NODE) {
    return element.parentNode ? getElementXPath(element.parentNode) : '';
  }
  const el = element as Element;
  const parent = el.parentNode;
  if (!parent) return '';
  let ix = 0;
  const siblings = parent.childNodes;
  for (let i = 0; i < siblings.length; i++) {
    const sibling = siblings[i];
    if (sibling === el) {
      return getElementXPath(parent) + '/' + el.tagName.toLowerCase() + '[' + (ix + 1) + ']';
    }
    if (sibling.nodeType === Node.ELEMENT_NODE && (sibling as Element).tagName === el.tagName) ix++;
  }
  return '';
}

export function getElementByXPath(xpath: string): Element | null {
  try {
    return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
      .singleNodeValue as Element | null;
  } catch {
    return null;
  }
}

// --- End Obsidian Web Clipper adaptations ---

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
