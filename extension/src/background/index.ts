import { captureFullPage, captureViewport, cropElement } from './screenshot.js';
import { buildMarkdown, buildZip } from './export.js';
import { sendToMcp } from './mcp.js';
import type { Session } from '../shared/types.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Messages tagged for the offscreen document are not for us
  if (message?.target === 'offscreen') return false;

  if (message.type === 'CAPTURE_FULL_PAGE') {
    const tabId = message.tabId ?? sender.tab?.id;
    captureFullPage(tabId)
      .then((base64) => sendResponse({ base64 }))
      .catch((e) => sendResponse({ error: String(e) }));
    return true;
  }

  if (message.type === 'CAPTURE_VIEWPORT') {
    const tabId = message.tabId ?? sender.tab?.id;
    captureViewport(tabId)
      .then((base64) => sendResponse({ base64 }))
      .catch((e) => sendResponse({ error: String(e) }));
    return true;
  }

  if (message.type === 'CROP_ELEMENT') {
    const { fullPageBase64, boundingBox } = message;
    cropElement(fullPageBase64, boundingBox.x, boundingBox.y, boundingBox.width, boundingBox.height)
      .then((base64) => sendResponse({ base64 }))
      .catch((e) => sendResponse({ error: String(e) }));
    return true;
  }

  if (message.type === 'EXPORT_MARKDOWN') {
    const md = buildMarkdown(message.session as Session);
    sendResponse({ markdown: md });
    return true;
  }

  if (message.type === 'EXPORT_ZIP') {
    buildZip(message.session as Session)
      .then(async (blob) => {
        const ab = await blob.arrayBuffer();
        sendResponse({ buffer: Array.from(new Uint8Array(ab)) });
      })
      .catch((e) => sendResponse({ error: String(e) }));
    return true;
  }

  if (message.type === 'SEND_TO_MCP') {
    const port = message.port ?? 3579;
    sendToMcp(message.session as Session, port)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ error: String(e) }));
    return true;
  }

});

// Enable annotation mode when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDEBAR' });
  }
});
