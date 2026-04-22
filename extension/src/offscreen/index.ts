import { stitchStrips, cropFromFullPage } from './canvas.js';
import { startRecording, stopRecording } from './recorder.js';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'STITCH_SCREENSHOTS') {
    stitchStrips(message.strips).then(sendResponse);
    return true;
  }
  if (message.type === 'CROP_ELEMENT') {
    const { fullPageBase64, x, y, width, height } = message;
    cropFromFullPage(fullPageBase64, x, y, width, height).then(sendResponse);
    return true;
  }
  if (message.type === 'START_RECORDING') {
    startRecording(message.sources).then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ error: String(e) }));
    return true;
  }
  if (message.type === 'STOP_RECORDING') {
    stopRecording().then(sendResponse).catch((e) => sendResponse({ error: String(e) }));
    return true;
  }
});
