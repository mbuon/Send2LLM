type RecordingSource = 'screen' | 'microphone' | 'tab-audio';

let mediaRecorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let startTime = 0;
let activeSources: RecordingSource[] = [];
let activeStream: MediaStream | null = null;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function startRecording(sources: RecordingSource[]): Promise<void> {
  if (mediaRecorder) throw new Error('Recording already in progress');
  activeSources = sources;
  chunks = [];

  const screenStream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: sources.includes('tab-audio'),
  });

  const tracks = [...screenStream.getTracks()];

  if (sources.includes('microphone')) {
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    micStream.getAudioTracks().forEach((t) => tracks.push(t));
  }

  activeStream = new MediaStream(tracks);
  mediaRecorder = new MediaRecorder(activeStream, { mimeType: 'video/webm;codecs=vp9' });
  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  startTime = Date.now();
  mediaRecorder.start(1000);
}

export function stopRecording(): Promise<{ base64: string; durationMs: number; sources: RecordingSource[] }> {
  return new Promise((resolve, reject) => {
    if (!mediaRecorder) { reject(new Error('No active recording')); return; }
    const durationMs = Date.now() - startTime;
    const recorder = mediaRecorder;
    const stream = activeStream;
    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const base64 = await blobToBase64(blob);
      mediaRecorder = null;
      activeStream = null;
      resolve({ base64, durationMs, sources: activeSources });
    };
    recorder.stop();
    stream?.getTracks().forEach((t) => t.stop());
  });
}

export function isRecordingActive(): boolean {
  return mediaRecorder !== null;
}
