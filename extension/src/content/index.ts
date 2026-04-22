import { startConsoleCapture } from './console-capture.js';
import { toggleSidebar } from './sidebar/sidebar.js';

startConsoleCapture();

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'TOGGLE_SIDEBAR') {
    toggleSidebar();
  }
});
