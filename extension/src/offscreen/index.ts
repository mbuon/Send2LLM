import { stitchStrips, cropFromFullPage } from './canvas.js';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'offscreen') return false;

  if (message.type === 'STITCH_SCREENSHOTS') {
    stitchStrips(message.strips)
      .then(sendResponse)
      .catch((e) => sendResponse({ error: String(e) }));
    return true;
  }
  if (message.type === 'CROP_ELEMENT') {
    const { fullPageBase64, x, y, width, height } = message;
    cropFromFullPage(fullPageBase64, x, y, width, height)
      .then(sendResponse)
      .catch((e) => sendResponse({ error: String(e) }));
    return true;
  }
  return false;
});
