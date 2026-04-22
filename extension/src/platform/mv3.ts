export async function sendMessageToTab(tabId: number, message: unknown): Promise<unknown> {
  return chrome.tabs.sendMessage(tabId, message);
}

export async function captureVisibleTab(windowId: number): Promise<string> {
  return chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
}

export async function executeScript<T>(tabId: number, func: () => T): Promise<T> {
  const results = await chrome.scripting.executeScript({ target: { tabId }, func });
  return results[0].result as T;
}

export async function getStorage(keys: string[]): Promise<Record<string, unknown>> {
  return chrome.storage.local.get(keys);
}

export async function setStorage(items: Record<string, unknown>): Promise<void> {
  return chrome.storage.local.set(items);
}
