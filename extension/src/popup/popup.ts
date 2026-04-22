document.getElementById('toggle-btn')!.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.id || !tab.url || /^(chrome|edge|about|moz-extension|chrome-extension):/i.test(tab.url)) {
    alert('Send2LLM cannot run on this page (browser internal page).');
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDEBAR' });
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/index.js'] });
      await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDEBAR' });
    } catch (e) {
      alert(`Send2LLM: ${(e as Error).message}`);
      return;
    }
  }
  window.close();
});
