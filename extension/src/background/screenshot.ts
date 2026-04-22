const OFFSCREEN_URL = chrome.runtime.getURL('offscreen.html');

async function ensureOffscreen(): Promise<void> {
  const existing = await (chrome as any).offscreen?.getContexts?.() ?? [];
  if (existing.length === 0) {
    await (chrome as any).offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['BLOBS'],
      justification: 'Canvas stitching and MediaRecorder for Send2LLM',
    });
  }
}

export async function captureFullPage(tabId: number): Promise<string> {
  await ensureOffscreen();

  const [{ windowId }] = await chrome.tabs.query({ active: true, currentWindow: true });
  const scrollInfo: { scrollY: number; scrollHeight: number; viewportHeight: number } =
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({ scrollY: window.scrollY, scrollHeight: document.body.scrollHeight, viewportHeight: window.innerHeight }),
    }).then((r) => r[0].result);

  // Scroll to top
  await chrome.scripting.executeScript({ target: { tabId }, func: () => window.scrollTo(0, 0) });
  await new Promise((r) => setTimeout(r, 150));

  const strips: string[] = [];
  let scrolled = 0;

  while (scrolled < scrollInfo.scrollHeight) {
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId!, { format: 'png' });
    strips.push(dataUrl);
    scrolled += scrollInfo.viewportHeight;
    if (scrolled < scrollInfo.scrollHeight) {
      await chrome.scripting.executeScript({ target: { tabId }, func: (y: number) => window.scrollTo(0, y), args: [scrolled] });
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  // Restore scroll position
  await chrome.scripting.executeScript({ target: { tabId }, func: (y: number) => window.scrollTo(0, y), args: [scrollInfo.scrollY] });

  const base64 = await chrome.runtime.sendMessage({ type: 'STITCH_SCREENSHOTS', strips });
  return base64 as string;
}

export async function cropElement(
  fullPageBase64: string, x: number, y: number, width: number, height: number,
): Promise<string> {
  return chrome.runtime.sendMessage({ type: 'CROP_ELEMENT', fullPageBase64, x, y, width, height }) as Promise<string>;
}
