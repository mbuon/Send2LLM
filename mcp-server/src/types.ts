// mcp-server/src/types.ts
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Annotation {
  id: string;
  number: number;
  type: 'task' | 'bug' | 'comment' | 'request';
  note: string;
  selector: string;
  elementHTML: string;
  elementScreenshotPath: string;
  boundingBox: BoundingBox;
  createdAt: string;
}

export interface ConsoleEntry {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  message: string;
  timestamp: string;
}

export interface RecordingMeta {
  id: string;
  filename: string;
  path: string;
  sources: ('screen' | 'microphone' | 'tab-audio')[];
  durationMs: number;
  mimeType?: string;
  hasAudio?: boolean;
  hasVideo?: boolean;
  /** Filled in by the server's automatic whisper.cpp transcription step. */
  transcript?: string;
  /** ISO-8601 timestamp when the transcript completed. */
  transcribedAt?: string;
}

export interface Session {
  id: string;
  url: string;
  pageTitle: string;
  capturedAt: string;
  fullPageScreenshotPath: string;
  annotations: Annotation[];
  consoleLogs: ConsoleEntry[];
  sessionStorage: Record<string, string>;
  recordings: RecordingMeta[];
}
