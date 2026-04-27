const OFFSCREEN_URL = chrome.runtime.getURL('offscreen.html');

async function ensureOffscreen(): Promise<void> {
  const offscreen = (chrome as any).offscreen;
  // Firefox MV2 has no chrome.offscreen — the background page itself can host canvas
  if (!offscreen?.createDocument) return;
  try {
    const existing = await offscreen.getContexts?.({ contextTypes: ['OFFSCREEN_DOCUMENT'] }) ?? [];
    if (existing.length > 0) return;
  } catch { /* getContexts not available — try create and swallow "already exists" */ }
  try {
    await offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['BLOBS'],
      justification: 'Canvas stitching for Send2LLM',
    });
  } catch (e) {
    const msg = String(e);
    if (!msg.includes('already') && !msg.includes('single offscreen')) throw e;
  }
}

// chrome.tabs.captureVisibleTab is throttled to MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND
// (2 calls/sec on most channels). A tight stitch loop — or a Send→MCP that runs
// right after an element crop also captured — trips the quota and returns
// an error instead of a dataUrl. Space calls ≥550ms apart and retry once on
// quota errors with a longer wait.
let lastCaptureAt = 0;
const MIN_CAPTURE_GAP_MS = 550;

async function throttledCaptureVisibleTab(windowId: number): Promise<string> {
  const wait = Math.max(0, MIN_CAPTURE_GAP_MS - (Date.now() - lastCaptureAt));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
    lastCaptureAt = Date.now();
    return dataUrl;
  } catch (e) {
    if (String(e).includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND')) {
      await new Promise((r) => setTimeout(r, 1100));
      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
      lastCaptureAt = Date.now();
      return dataUrl;
    }
    throw e;
  }
}

// Hide Send2LLM's own UI (sidebar host, picker overlay, highlight) so it
// doesn't appear in captures. Returns a restore function. The sidebar host
// has `:host { all: initial; }` which defeats normal inline `visibility`,
// so we set display:none with !important via cssText.
async function hideOwnUi(tabId: number): Promise<() => Promise<void>> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const ids = ['s2l-sidebar-host', 's2l-pick-overlay', 's2l-pick-highlight'];
        for (const id of ids) {
          const el = document.getElementById(id) as HTMLElement | null;
          if (el) {
            el.dataset.s2lPrevCss = el.style.cssText;
            el.style.cssText = `${el.style.cssText}; display: none !important;`;
          }
        }
      },
    });
  } catch { /* tab may have navigated */ }
  return async () => {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const ids = ['s2l-sidebar-host', 's2l-pick-overlay', 's2l-pick-highlight'];
          for (const id of ids) {
            const el = document.getElementById(id) as HTMLElement | null;
            if (el) {
              el.style.cssText = el.dataset.s2lPrevCss ?? '';
              delete el.dataset.s2lPrevCss;
            }
          }
        },
      });
    } catch { /* tab may have closed */ }
  };
}

// Inject a stylesheet that disables smooth scroll, animations, transitions,
// and sticky positioning during capture. Returns a restore function.
// Without this, sticky headers appear as ghost copies at every strip, and
// smooth scrolling makes scrollY lag behind scrollTo so strips misalign.
async function freezeCaptureState(tabId: number): Promise<() => Promise<void>> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const style = document.createElement('style');
        style.id = 's2l-capture-freeze';
        style.textContent = `
          html { scroll-behavior: auto !important; }
          *, *::before, *::after {
            animation-duration: 0s !important;
            animation-delay: 0s !important;
            transition-duration: 0s !important;
            transition-delay: 0s !important;
          }
          *[style*="position: sticky"],
          *[style*="position:sticky"] {
            position: static !important;
          }
        `;
        document.documentElement.appendChild(style);
        // Also neutralise computed sticky elements — inline rules above only
        // catch inline styles. For stylesheet-driven sticky we walk the DOM.
        const stickyEls: HTMLElement[] = [];
        document.querySelectorAll<HTMLElement>('*').forEach((el) => {
          const cs = getComputedStyle(el);
          if (cs.position === 'sticky' || cs.position === 'fixed') {
            stickyEls.push(el);
            el.dataset.s2lPrevPos = el.style.position;
            el.style.setProperty('position', 'static', 'important');
          }
        });
        (window as unknown as { __s2lStickyEls?: HTMLElement[] }).__s2lStickyEls = stickyEls;
      },
    });
  } catch { /* ignore */ }
  return async () => {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          document.getElementById('s2l-capture-freeze')?.remove();
          const w = window as unknown as { __s2lStickyEls?: HTMLElement[] };
          (w.__s2lStickyEls ?? []).forEach((el) => {
            el.style.position = el.dataset.s2lPrevPos ?? '';
            delete el.dataset.s2lPrevPos;
          });
          delete w.__s2lStickyEls;
        },
      });
    } catch { /* ignore */ }
  };
}

async function readScrollMetrics(tabId: number): Promise<{ scrollY: number; scrollHeight: number; viewportHeight: number }> {
  return (await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      scrollY: window.scrollY,
      scrollHeight: Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.offsetHeight,
      ),
      viewportHeight: window.innerHeight,
    }),
  }))[0].result as { scrollY: number; scrollHeight: number; viewportHeight: number };
}

// Scroll through the page in big steps until scrollHeight stops growing for
// 2 consecutive steps. Wakes up IntersectionObservers, lazy <img loading="lazy">
// and infinite-scroll listeners before the real capture begins.
async function primeLazyLoad(tabId: number): Promise<void> {
  const MAX_PRIME_STEPS = 40;
  let prevHeight = 0;
  let stableCount = 0;
  for (let step = 0; step < MAX_PRIME_STEPS; step++) {
    const m = await readScrollMetrics(tabId);
    const atBottom = m.scrollY + m.viewportHeight >= m.scrollHeight - 2;
    const grew = m.scrollHeight > prevHeight;
    prevHeight = m.scrollHeight;
    if (atBottom && !grew) {
      stableCount++;
      if (stableCount >= 2) {
        console.log('[Send2LLM/bg] primeLazyLoad: stable at bottom', { step, scrollHeight: m.scrollHeight });
        return;
      }
    } else {
      stableCount = 0;
    }
    const next = Math.min(m.scrollY + m.viewportHeight * 2, m.scrollHeight);
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (y: number) => {
        window.scrollTo(0, y);
        window.dispatchEvent(new Event('scroll'));
      },
      args: [next],
    });
    // Give lazy loaders a moment to react.
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log('[Send2LLM/bg] primeLazyLoad: MAX_PRIME_STEPS reached');
}

export async function captureFullPage(tabId: number): Promise<string> {
  if (!tabId) throw new Error('captureFullPage: tabId required');
  await ensureOffscreen();

  // Use the windowId of the target tab, not the currently-active tab
  const targetTab = await chrome.tabs.get(tabId);
  const windowId = targetTab.windowId;

  const scrollInfo = await readScrollMetrics(tabId);
  console.log('[Send2LLM/bg] captureFullPage: scrollInfo', scrollInfo);
  // Hard safety cap on strips — fetch transport is limited by Chrome's
  // runtime.sendMessage 64MiB cap after base64 encoding. 25 strips at 2x DPR
  // JPEG quality 0.85 is comfortably under that.
  const MAX_STRIPS = 25;
  const restoreUi = await hideOwnUi(tabId);
  let restoreCss: () => Promise<void> = async () => {};
  const strips: { dataUrl: string; cropTop: number }[] = [];
  try {
    // Freeze page state: disable smooth scrolling, animations, transitions,
    // and sticky positioning so (a) scrolls land exactly where we tell them,
    // and (b) sticky headers don't leave ghost copies at every strip.
    restoreCss = await freezeCaptureState(tabId);

    // Pre-scroll the page from top to bottom in viewport-sized steps and wait
    // for scrollHeight to stop growing. This wakes up lazy-loaders (images,
    // embeds, infinite scroll batches) before we start capturing. Without this,
    // content only loads as we scroll and the capture races the lazy-loader.
    await primeLazyLoad(tabId);

    // After priming, reset to the top for the real capture.
    await chrome.scripting.executeScript({ target: { tabId }, func: () => window.scrollTo(0, 0) });
    await new Promise((r) => setTimeout(r, 300));

    let prevActualY = -1;
    // Track the previous strip's actual Y so overshoot can be computed against
    // what the page really scrolled to, not what we requested. Pages with
    // sticky headers or scroll snapping may refuse the exact offset.
    for (let i = 0; ; i++) {
      // Re-read scrollHeight every iteration: pages with lazy-loaded content
      // grow as we scroll, so a one-shot snapshot captured at the top would
      // stop the loop early.
      const metrics = await readScrollMetrics(tabId);
      const actualY = metrics.scrollY;

      // Page refused to scroll further — stop, otherwise we'd loop forever.
      if (i > 0 && actualY <= prevActualY) {
        console.log('[Send2LLM/bg] stitch: scroll refused, stopping', { i, actualY, prevActualY });
        break;
      }

      const dataUrl = await throttledCaptureVisibleTab(windowId);
      const overshoot = i === 0
        ? 0
        : Math.max(0, (prevActualY + metrics.viewportHeight) - actualY);
      strips.push({ dataUrl, cropTop: overshoot });
      console.log('[Send2LLM/bg] stitch strip', { i, actualY, scrollHeight: metrics.scrollHeight, viewportHeight: metrics.viewportHeight, overshoot });

      if (strips.length >= MAX_STRIPS) {
        console.log('[Send2LLM/bg] stitch: MAX_STRIPS reached, stopping', { count: strips.length });
        break;
      }

      if (actualY + metrics.viewportHeight >= metrics.scrollHeight) {
        console.log('[Send2LLM/bg] stitch: reached bottom', { actualY, scrollHeight: metrics.scrollHeight });
        break;
      }

      prevActualY = actualY;
      const next = Math.min(
        actualY + metrics.viewportHeight,
        metrics.scrollHeight - metrics.viewportHeight,
      );
      await chrome.scripting.executeScript({ target: { tabId }, func: (y: number) => window.scrollTo(0, y), args: [next] });
      // Wait a touch longer than the throttle gap so layout settles.
      await new Promise((r) => setTimeout(r, 300));
    }
  } finally {
    // Always restore the user's scroll position, even if capture threw.
    await chrome.scripting.executeScript({
      target: { tabId }, func: (y: number) => window.scrollTo(0, y), args: [scrollInfo.scrollY],
    }).catch(() => { /* tab may have closed */ });
    await restoreCss();
    await restoreUi();
  }

  const base64 = await sendToOffscreen({ type: 'STITCH_SCREENSHOTS', strips });
  return base64 as string;
}

// Single-frame viewport capture — fast, no scrolling. Used when the user
// does not want a full-page scroll-and-stitch.
export async function captureViewport(tabId: number): Promise<string> {
  if (!tabId) throw new Error('captureViewport: tabId required');
  const targetTab = await chrome.tabs.get(tabId);
  const restoreUi = await hideOwnUi(tabId);
  try {
    // Give the browser a frame to apply the visibility change before capturing.
    await new Promise((r) => setTimeout(r, 50));
    const dataUrl = await throttledCaptureVisibleTab(targetTab.windowId);
    return dataUrl.split(',')[1] ?? '';
  } finally {
    await restoreUi();
  }
}

export async function cropElement(
  fullPageBase64: string, x: number, y: number, width: number, height: number, dpr = 1,
): Promise<string> {
  await ensureOffscreen();
  return (await sendToOffscreen({ type: 'CROP_ELEMENT', fullPageBase64, x, y, width, height, dpr })) as string;
}

async function sendToOffscreen(message: unknown): Promise<unknown> {
  // Use the runtime channel but avoid the background's own onMessage by tagging the target.
  // Offscreen filters on `target === 'offscreen'`.
  return chrome.runtime.sendMessage({ ...(message as object), target: 'offscreen' });
}
