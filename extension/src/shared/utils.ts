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

// URL + DOM utilities. Concept and tracking-param list inspired by Obsidian
// Web Clipper (MIT); implementations below are Send2LLM's own. See NOTICES.md.

const TRACKING_PARAM_PREFIXES = ['utm_', 'mc_'];
const TRACKING_PARAMS_EXACT = new Set([
  'ref', 'source', 'src', 'si',
  'fbclid', 'gclid', 'dclid', 'msclkid', 'twclid',
  '_ga', '_gl',
]);

function isTrackingParam(key: string): boolean {
  if (TRACKING_PARAMS_EXACT.has(key)) return true;
  return TRACKING_PARAM_PREFIXES.some((p) => key.startsWith(p));
}

export function canonicalizePageUrl(rawUrl: string): string {
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch { return rawUrl; }
  parsed.hash = '';
  const kept = new URLSearchParams();
  for (const [k, v] of parsed.searchParams) {
    if (!isTrackingParam(k)) kept.append(k, v);
  }
  parsed.search = kept.toString();
  return parsed.toString();
}

const BROWSER_INTERNAL_PROTOCOLS = new Set([
  'chrome:', 'edge:', 'about:', 'moz-extension:', 'chrome-extension:',
]);

const EXTENSION_STORE_HOSTS: { host: string; pathPrefix?: string }[] = [
  { host: 'addons.mozilla.org' },
  { host: 'chromewebstore.google.com' },
  { host: 'chrome.google.com', pathPrefix: '/webstore' },
  { host: 'microsoftedge.microsoft.com', pathPrefix: '/addons' },
];

export function isUninjectableUrl(rawUrl: string): boolean {
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch { return false; }
  if (BROWSER_INTERNAL_PROTOCOLS.has(parsed.protocol.toLowerCase())) return true;
  for (const entry of EXTENSION_STORE_HOSTS) {
    if (parsed.hostname !== entry.host) continue;
    if (!entry.pathPrefix || parsed.pathname.startsWith(entry.pathPrefix)) return true;
  }
  return false;
}

// Build a positional XPath for `target`, walking up iteratively. More resilient
// to class/id churn than CSS selectors.
export function computeElementXPath(target: Element): string {
  const parts: string[] = [];
  let node: Element | null = target;
  while (node && node.nodeType === Node.ELEMENT_NODE) {
    const parent: Element | null = node.parentElement;
    if (!parent) {
      parts.unshift('/' + node.tagName.toLowerCase());
      break;
    }
    const tag = node.tagName;
    let index = 1;
    for (const sib of Array.from(parent.children)) {
      if (sib === node) break;
      if (sib.tagName === tag) index++;
    }
    parts.unshift('/' + tag.toLowerCase() + '[' + index + ']');
    node = parent;
  }
  return parts.join('');
}

export function resolveXPath(xpath: string): Element | null {
  try {
    const result = document.evaluate(
      xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null,
    );
    return (result.singleNodeValue as Element | null) ?? null;
  } catch {
    return null;
  }
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
