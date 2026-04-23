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

chrome.runtime.onMessage.addListener((message) => {
  if (epochHolder.__send2llmEpoch !== CURRENT_EPOCH) return;
  if (message.type === 'TOGGLE_SIDEBAR') {
    toggleSidebar();
  }
});
