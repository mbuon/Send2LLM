import { isUninjectableUrl } from '../shared/utils.js';

async function ping(tabId: number): Promise<boolean> {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    return !!res?.ok;
  } catch {
    return false;
  }
}

async function injectContentScript(tabId: number): Promise<void> {
  const scripting = (chrome as unknown as { scripting?: chrome.scripting.ScriptingStatic }).scripting;
  if (scripting?.executeScript) {
    await scripting.executeScript({ target: { tabId }, files: ['content/index.js'] });
    return;
  }
  const legacy = (chrome as unknown as { tabs: { executeScript?: (id: number, opts: { file: string }, cb: () => void) => void } }).tabs;
  if (legacy.executeScript) {
    await new Promise<void>((resolve, reject) => {
      legacy.executeScript!(tabId, { file: 'content/index.js' }, () => {
        const err = chrome.runtime.lastError;
        if (err) reject(new Error(err.message)); else resolve();
      });
    });
    return;
  }
  throw new Error('No scripting API available in this browser');
}

async function waitForContentScript(tabId: number, timeoutMs = 1500): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await ping(tabId)) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

document.getElementById('toggle-btn')!.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.id || !tab.url) {
    alert('Send2LLM: no active tab.');
    return;
  }
  if (isUninjectableUrl(tab.url)) {
    alert('Send2LLM cannot run on this page (browser internal page or extension store).');
    return;
  }

  try {
    let alive = await ping(tab.id);
    if (!alive) {
      await injectContentScript(tab.id);
      alive = await waitForContentScript(tab.id);
      if (!alive) throw new Error('Content script failed to load. Try reloading the tab.');
    }
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDEBAR' });
    window.close();
  } catch (e) {
    alert(`Send2LLM: ${(e as Error).message}`);
  }
});
