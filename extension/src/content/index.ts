import { startConsoleCapture } from './console-capture.js';
import { toggleSidebar } from './sidebar/sidebar.js';

// Generation counter (pattern adapted from Obsidian Web Clipper, MIT).
// After an extension reload, the previous content-script's listeners stay attached
// in the page until navigation. We bump a shared counter and ignore messages
// that arrive on stale listeners. See NOTICES.md.
const w = window as unknown as { __s2lGen?: number };
const GEN = (w.__s2lGen = (w.__s2lGen || 0) + 1);

startConsoleCapture();

chrome.runtime.onMessage.addListener((message) => {
  if (w.__s2lGen !== GEN) return;
  if (message.type === 'TOGGLE_SIDEBAR') {
    toggleSidebar();
  }
});
