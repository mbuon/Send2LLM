import type { Session } from '../shared/types.js';

const DEFAULT_PORT = 3579;

export async function sendToMcp(session: Session, port = DEFAULT_PORT): Promise<void> {
  const elementScreenshots: Record<string, string> = {};
  for (const ann of session.annotations) {
    if (ann.elementScreenshotBase64) {
      elementScreenshots[ann.id] = ann.elementScreenshotBase64;
    }
  }

  const payload = {
    session: {
      ...session,
      fullPageScreenshotBase64: undefined,
      annotations: session.annotations.map((a) => ({ ...a, elementScreenshotBase64: undefined })),
    },
    fullPageScreenshotBase64: session.fullPageScreenshotBase64 || null,
    elementScreenshots,
    ...(session.recording?.base64 ? { recordingBase64: session.recording.base64 } : {}),
  };

  const res = await fetch(`http://localhost:${port}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`MCP server error ${res.status}: ${body}`);
  }
}
