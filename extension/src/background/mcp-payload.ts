import type { Session } from '../shared/types.js';

// Shape the POST body the MCP server expects. Pure function — safe to call
// from either the content script or the background service worker.
export function buildMcpPayload(session: Session): unknown {
  const elementScreenshots: Record<string, string> = {};
  for (const ann of session.annotations) {
    if (ann.elementScreenshotBase64) {
      elementScreenshots[ann.id] = ann.elementScreenshotBase64;
    }
  }

  // Preserve 1:1 index correspondence with session.recordings. The server
  // pairs recordingsBase64[i] with recordings[i], so empty slots must stay as
  // empty strings, not be filtered out.
  const recordingsBase64 = (session.recordings ?? []).map((r) => r.base64 ?? '');
  const anyBase64 = recordingsBase64.some((b) => b.length > 0);

  return {
    session: {
      ...session,
      fullPageScreenshotBase64: undefined,
      annotations: session.annotations.map((a) => ({ ...a, elementScreenshotBase64: undefined })),
      recordings: (session.recordings ?? []).map((r) => ({ ...r, base64: undefined })),
    },
    fullPageScreenshotBase64: session.fullPageScreenshotBase64 || null,
    elementScreenshots,
    ...(anyBase64 ? { recordingsBase64 } : {}),
  };
}
