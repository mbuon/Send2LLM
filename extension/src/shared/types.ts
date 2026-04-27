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
  xpath?: string;
  elementHTML: string;
  elementScreenshotBase64: string;
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
  base64?: string;
}

export interface Session {
  id: string;
  url: string;
  pageTitle: string;
  capturedAt: string;
  fullPageScreenshotBase64: string;
  fullPageScreenshotPath: string;
  annotations: Annotation[];
  consoleLogs: ConsoleEntry[];
  sessionStorage: Record<string, string>;
  recordings: RecordingMeta[];
}
