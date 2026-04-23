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
    if (!String(e).includes('already')) throw e;
  }
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

  await chrome.scripting.executeScript({ target: { tabId }, func: () => window.scrollTo(0, 0) });
  await new Promise((r) => setTimeout(r, 200));

  const strips: { dataUrl: string; cropTop: number }[] = [];
  let scrolled = 0;

  while (scrolled < scrollInfo.scrollHeight) {
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
    // If the last strip overshoots the page bottom, mark how much to crop from its top
    const overshoot = Math.max(0, (scrolled + scrollInfo.viewportHeight) - scrollInfo.scrollHeight);
    strips.push({ dataUrl, cropTop: scrolled === 0 ? 0 : overshoot });
    scrolled += scrollInfo.viewportHeight;
    if (scrolled < scrollInfo.scrollHeight) {
      const next = Math.min(scrolled, scrollInfo.scrollHeight - scrollInfo.viewportHeight);
      await chrome.scripting.executeScript({ target: { tabId }, func: (y: number) => window.scrollTo(0, y), args: [next] });
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  await chrome.scripting.executeScript({ target: { tabId }, func: (y: number) => window.scrollTo(0, y), args: [scrollInfo.scrollY] });

  const base64 = await sendToOffscreen({ type: 'STITCH_SCREENSHOTS', strips });
  return base64 as string;
}

// Single-frame viewport capture — fast, no scrolling. Used when the user
// does not want a full-page scroll-and-stitch.
export async function captureViewport(tabId: number): Promise<string> {
  if (!tabId) throw new Error('captureViewport: tabId required');
  const targetTab = await chrome.tabs.get(tabId);
  const dataUrl = await chrome.tabs.captureVisibleTab(targetTab.windowId, { format: 'png' });
  return dataUrl.split(',')[1] ?? '';
}

export async function cropElement(
  fullPageBase64: string, x: number, y: number, width: number, height: number,
): Promise<string> {
  return (await sendToOffscreen({ type: 'CROP_ELEMENT', fullPageBase64, x, y, width, height })) as string;
}

async function sendToOffscreen(message: unknown): Promise<unknown> {
  // Use the runtime channel but avoid the background's own onMessage by tagging the target.
  // Offscreen filters on `target === 'offscreen'`.
  return chrome.runtime.sendMessage({ ...(message as object), target: 'offscreen' });
}
