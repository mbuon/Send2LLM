import { stitchStrips, cropFromFullPage } from './canvas.js';
import { startRecording, stopRecording, getState } from './recorder.js';

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
  if (message.type === 'OFFSCREEN_RECORDING_START') {
    startRecording(message.sources)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ error: String(e) }));
    return true;
  }
  if (message.type === 'OFFSCREEN_RECORDING_STOP') {
    stopRecording()
      .then((res) => sendResponse(res))
      .catch((e) => sendResponse({ error: String(e) }));
    return true;
  }
  if (message.type === 'OFFSCREEN_RECORDING_STATE') {
    sendResponse(getState());
    return false;
  }
  return false;
});
