import { isUninjectableUrl } from '../shared/utils.js';

document.getElementById('toggle-btn')!.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.id || !tab.url || isUninjectableUrl(tab.url)) {
    alert('Send2LLM cannot run on this page (browser internal page or extension store).');
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDEBAR' });
  } catch {
    try {
      const scripting = (chrome as any).scripting;
      if (scripting?.executeScript) {
        await scripting.executeScript({ target: { tabId: tab.id }, files: ['content/index.js'] });
      } else if ((chrome as any).tabs?.executeScript) {
        // Firefox MV2 fallback
        await new Promise<void>((resolve, reject) => {
          (chrome as any).tabs.executeScript(tab.id, { file: 'content/index.js' },
            () => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve());
        });
      } else {
        throw new Error('No scripting API available');
      }
      await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDEBAR' });
    } catch (e) {
      alert(`Send2LLM: ${(e as Error).message}`);
      return;
    }
  }
  window.close();
});
