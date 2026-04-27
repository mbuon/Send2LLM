import { startConsoleCapture } from './console-capture.js';
import { toggleSidebar, ensureSidebarFromStorage, watchSidebarFlag } from './sidebar/sidebar.js';

// After the extension reloads, message listeners from the previous content-script
// instance stay attached to the page until navigation. Each instance stamps
// itself with an incrementing epoch on the window object; handlers ignore
// messages unless they belong to the current epoch. (Pattern credit: NOTICES.md.)
interface EpochHolder { __send2llmEpoch?: number }
const epochHolder = window as unknown as EpochHolder;
epochHolder.__send2llmEpoch = (epochHolder.__send2llmEpoch ?? 0) + 1;
const CURRENT_EPOCH = epochHolder.__send2llmEpoch;

startConsoleCapture();

// Restore the sidebar on every page load if the user previously turned it
// on, so navigating links and opening new tabs doesn't lose the widget.
// And subscribe to the toggle flag so cross-tab toggles propagate.
void ensureSidebarFromStorage();
watchSidebarFlag();

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
