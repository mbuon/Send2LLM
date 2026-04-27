import { startConsoleCapture } from './console-capture.js';
import { toggleSidebar } from './sidebar/sidebar.js';

// After the extension reloads, message listeners from the previous content-script
// instance stay attached to the page until navigation. Each instance stamps
// itself with an incrementing epoch on the window object; handlers ignore
// messages unless they belong to the current epoch. (Pattern credit: NOTICES.md.)
interface EpochHolder { __send2llmEpoch?: number }
const epochHolder = window as unknown as EpochHolder;
epochHolder.__send2llmEpoch = (epochHolder.__send2llmEpoch ?? 0) + 1;
const CURRENT_EPOCH = epochHolder.__send2llmEpoch;

startConsoleCapture();

// The sidebar is purely opt-in: the toolbar icon click is the ONLY thing
// that mounts it. We do NOT auto-restore on page load — that turned the
// widget into a permanent overlay the user could not get rid of.

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (epochHolder.__send2llmEpoch !== CURRENT_EPOCH) return;
  if (message?.type === 'PING') {
    sendResponse({ ok: true, epoch: CURRENT_EPOCH });
    return;
  }
  if (message?.type === 'TOGGLE_SIDEBAR') {
    toggleSidebar();
    sendResponse({ ok: true });
  }
});
