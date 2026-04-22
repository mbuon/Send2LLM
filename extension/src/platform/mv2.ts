import browser from 'webextension-polyfill';

export async function sendMessageToTab(tabId: number, message: unknown): Promise<unknown> {
  return browser.tabs.sendMessage(tabId, message);
}

export async function captureVisibleTab(windowId: number): Promise<string> {
  return browser.tabs.captureVisibleTab(windowId, { format: 'png' }) as Promise<string>;
}

export async function executeScript<T>(tabId: number, func: () => T): Promise<T> {
  const results = await browser.tabs.executeScript(tabId, { code: `(${func.toString()})()` });
  return results[0] as T;
}

export async function getStorage(keys: string[]): Promise<Record<string, unknown>> {
  return browser.storage.local.get(keys) as Promise<Record<string, unknown>>;
}

export async function setStorage(items: Record<string, unknown>): Promise<void> {
  return browser.storage.local.set(items);
}
