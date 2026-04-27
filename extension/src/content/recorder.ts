// The actual MediaRecorder lives in the persistent offscreen document so it
// survives content-script navigation. This module is just a thin RPC wrapper
// the sidebar uses to start, stop, and query recording state.
type RecordingSource = 'screen' | 'microphone' | 'tab-audio';

export interface RecordingState {
  active: boolean;
  startedAt?: number;            // epoch ms when recording started
  sources?: RecordingSource[];
}

export interface RecordingResult {
  base64: string;
  durationMs: number;
  sources: RecordingSource[];
}

export async function startRecording(sources: RecordingSource[]): Promise<void> {
  const res = await chrome.runtime.sendMessage({ type: 'RECORDING_START', sources });
  if (res?.error) throw new Error(res.error);
}

export async function stopRecording(): Promise<RecordingResult> {
  const res = await chrome.runtime.sendMessage({ type: 'RECORDING_STOP' });
  if (res?.error) throw new Error(res.error);
  return res as RecordingResult;
}

export async function getRecordingState(): Promise<RecordingState> {
  const res = await chrome.runtime.sendMessage({ type: 'RECORDING_STATE' });
  return (res ?? { active: false }) as RecordingState;
}
