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
// doesn't appear in captures. Returns a restore function.
async function hideOwnUi(tabId: number): Promise<() => Promise<void>> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const ids = ['s2l-sidebar-host', 's2l-pick-overlay', 's2l-pick-highlight'];
        for (const id of ids) {
          const el = document.getElementById(id) as HTMLElement | null;
          if (el) {
            el.dataset.s2lPrevVisibility = el.style.visibility;
            el.style.visibility = 'hidden';
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
              el.style.visibility = el.dataset.s2lPrevVisibility ?? '';
              delete el.dataset.s2lPrevVisibility;
            }
          }
        },
      });
    } catch { /* tab may have closed */ }
  };
}

export async function captureFullPage(tabId: number): Promise<string> {
  if (!tabId) throw new Error('captureFullPage: tabId required');
  await ensureOffscreen();

  // Use the windowId of the target tab, not the currently-active tab
  const targetTab = await chrome.tabs.get(tabId);
  const windowId = targetTab.windowId;

  const scrollInfo: { scrollY: number; scrollHeight: number; viewportHeight: number } =
    await chrome.scripting.executeScript({
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
    }).then((r) => r[0].result as { scrollY: number; scrollHeight: number; viewportHeight: number });

  const restoreUi = await hideOwnUi(tabId);
  const strips: { dataUrl: string; cropTop: number }[] = [];
  try {
    await chrome.scripting.executeScript({ target: { tabId }, func: () => window.scrollTo(0, 0) });
    await new Promise((r) => setTimeout(r, 200));

    let prevActualY = -1;
    // Track the previous strip's actual Y so overshoot can be computed against
    // what the page really scrolled to, not what we requested. Pages with
    // sticky headers or scroll snapping may refuse the exact offset.
    for (let i = 0; ; i++) {
      const actualY: number = (await chrome.scripting.executeScript({
        target: { tabId }, func: () => window.scrollY,
      }))[0].result as number;

      // Page refused to scroll further — stop, otherwise we'd loop forever.
      if (i > 0 && actualY <= prevActualY) break;

      const dataUrl = await throttledCaptureVisibleTab(windowId);
      const overshoot = i === 0
        ? 0
        : Math.max(0, (prevActualY + scrollInfo.viewportHeight) - actualY);
      strips.push({ dataUrl, cropTop: overshoot });

      if (actualY + scrollInfo.viewportHeight >= scrollInfo.scrollHeight) break;

      prevActualY = actualY;
      const next = Math.min(
        actualY + scrollInfo.viewportHeight,
        scrollInfo.scrollHeight - scrollInfo.viewportHeight,
      );
      await chrome.scripting.executeScript({ target: { tabId }, func: (y: number) => window.scrollTo(0, y), args: [next] });
      await new Promise((r) => setTimeout(r, 200));
    }
  } finally {
    // Always restore the user's scroll position, even if capture threw.
    await chrome.scripting.executeScript({
      target: { tabId }, func: (y: number) => window.scrollTo(0, y), args: [scrollInfo.scrollY],
    }).catch(() => { /* tab may have closed */ });
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
