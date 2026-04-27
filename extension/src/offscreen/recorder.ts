let mediaRecorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let startTime = 0;
let activeSources: ('screen' | 'microphone' | 'tab-audio')[] = [];

export function getState(): { active: boolean; startedAt?: number; sources?: ('screen' | 'microphone' | 'tab-audio')[] } {
  if (!mediaRecorder) return { active: false };
  return { active: true, startedAt: startTime, sources: [...activeSources] };
}

export async function startRecording(sources: ('screen' | 'microphone' | 'tab-audio')[]): Promise<void> {
  if (mediaRecorder) throw new Error('Recording already in progress');
  activeSources = sources;
  chunks = [];

  const constraints: DisplayMediaStreamOptions = {
    video: true,
    audio: sources.includes('tab-audio'),
  };
  const screenStream = await navigator.mediaDevices.getDisplayMedia(constraints);

  const tracks = [...screenStream.getTracks()];

  if (sources.includes('microphone')) {
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    micStream.getAudioTracks().forEach((t) => tracks.push(t));
  }

  const combinedStream = new MediaStream(tracks);
  mediaRecorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm;codecs=vp9' });
  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  startTime = Date.now();
  mediaRecorder.start(1000);
}

export function stopRecording(): Promise<{ base64: string; durationMs: number; sources: typeof activeSources }> {
  return new Promise((resolve, reject) => {
    if (!mediaRecorder) { reject(new Error('No active recording')); return; }
    const durationMs = Date.now() - startTime;
    const recorder = mediaRecorder;
    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const base64 = await blobToBase64(blob);
      const result = { base64, durationMs, sources: [...activeSources] };
      mediaRecorder = null;
      activeSources = [];
      chunks = [];
      resolve(result);
    };
    recorder.stop();
    recorder.stream.getTracks().forEach((t) => t.stop());
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
