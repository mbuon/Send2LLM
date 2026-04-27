import { captureFullPage, captureViewport, cropElement, ensureOffscreen } from './screenshot.js';
import { buildMarkdown, buildZip } from './export.js';
import { sendToMcp } from './mcp.js';
import type { Session } from '../shared/types.js';

const PENDING_REC_KEY = 's2l-pending-recording';

async function offscreenSend(message: object): Promise<unknown> {
  return chrome.runtime.sendMessage({ ...message, target: 'offscreen' });
}

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
    const { fullPageBase64, boundingBox, dpr } = message;
    cropElement(fullPageBase64, boundingBox.x, boundingBox.y, boundingBox.width, boundingBox.height, dpr ?? 1)
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

  // Recording lives in the offscreen document so it survives content-script
  // teardown when the user navigates between pages.
  if (message.type === 'RECORDING_START') {
    (async () => {
      try {
        await ensureOffscreen();
        const res = await offscreenSend({ type: 'OFFSCREEN_RECORDING_START', sources: message.sources });
        if ((res as { error?: string })?.error) {
          sendResponse({ error: (res as { error: string }).error });
          return;
        }
        // Clear any leftover pendingRecording from a previous session.
        await chrome.storage.local.remove(PENDING_REC_KEY);
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ error: String(e) });
      }
    })();
    return true;
  }

  if (message.type === 'RECORDING_STOP') {
    (async () => {
      try {
        await ensureOffscreen();
        const res = await offscreenSend({ type: 'OFFSCREEN_RECORDING_STOP' }) as
          { error?: string; base64?: string; durationMs?: number; sources?: string[] };
        if (res?.error) { sendResponse({ error: res.error }); return; }
        // Persist so the next content script (post-navigation) can pick it up
        // and show the inline preview / send it to MCP.
        await chrome.storage.local.set({ [PENDING_REC_KEY]: res });
        sendResponse(res);
      } catch (e) {
        sendResponse({ error: String(e) });
      }
    })();
    return true;
  }

  // Save a base64-encoded asset to the user's Downloads folder and ask the
  // OS to open it in the default app. Used when the user double-clicks an
  // annotation thumbnail or a recording preview in the sidebar.
  if (message.type === 'OPEN_IN_DEFAULT_APP') {
    (async () => {
      try {
        const { base64, mimeType, filename } = message as {
          base64: string; mimeType: string; filename: string;
        };
        const dataUrl = `data:${mimeType};base64,${base64}`;
        const downloadId = await chrome.downloads.download({
          url: dataUrl,
          filename,
          saveAs: false,
          conflictAction: 'uniquify',
        });
        // Wait for the download to finish before asking the OS to open it.
        // chrome.downloads.open() throws if the file isn't fully written yet.
        const onChanged = (delta: chrome.downloads.DownloadDelta): void => {
          if (delta.id !== downloadId) return;
          if (delta.state?.current === 'complete') {
            chrome.downloads.onChanged.removeListener(onChanged);
            try { chrome.downloads.open(downloadId); } catch (e) { console.error(e); }
          } else if (delta.state?.current === 'interrupted') {
            chrome.downloads.onChanged.removeListener(onChanged);
          }
        };
        chrome.downloads.onChanged.addListener(onChanged);
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ error: String(e) });
      }
    })();
    return true;
  }

  if (message.type === 'RECORDING_STATE') {
    (async () => {
      try {
        await ensureOffscreen();
        const res = await offscreenSend({ type: 'OFFSCREEN_RECORDING_STATE' });
        sendResponse(res ?? { active: false });
      } catch {
        sendResponse({ active: false });
      }
    })();
    return true;
  }

});

// Enable annotation mode when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDEBAR' });
  }
});
