let mediaRecorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let startTime = 0;
let activeSources: ('screen' | 'microphone' | 'tab-audio')[] = [];

export function getState(): { active: boolean; startedAt?: number; sources?: ('screen' | 'microphone' | 'tab-audio')[] } {
  if (!mediaRecorder) return { active: false };
  return { active: true, startedAt: startTime, sources: [...activeSources] };
}

// Pick the most-supported webm mimeType that includes BOTH a video and an
// audio codec. The previous "video/webm;codecs=vp9" string told Chrome to
// encode video only and silently dropped every audio track from the stream
// — that's why finished recordings had no microphone or tab audio.
function pickRecorderMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=h264,opus',
    'video/webm',
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined'
      && typeof MediaRecorder.isTypeSupported === 'function'
      && MediaRecorder.isTypeSupported(c)) {
      return c;
    }
  }
  return 'video/webm';
}

export async function startRecording(sources: ('screen' | 'microphone' | 'tab-audio')[]): Promise<void> {
  if (mediaRecorder) throw new Error('Recording already in progress');
  activeSources = sources;
  chunks = [];

  // Always request audio from the screen-share dialog when the user wants
  // either tab-audio OR microphone — without asking for audio at the
  // displayMedia level, Chrome won't let us encode audio later. The user
  // still has to tick "Share tab audio" in Chrome's share-picker for tab
  // audio specifically, but mic-only recordings need this too because the
  // recorder mux is a single MediaStream.
  const wantTabAudio = sources.includes('tab-audio');
  const screenStream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: wantTabAudio,
  });

  const tracks: MediaStreamTrack[] = [...screenStream.getTracks()];
  console.log('[Send2LLM/recorder] screen tracks:',
    screenStream.getTracks().map((t) => `${t.kind}:${t.label}`));

  // If the user wanted tab-audio but the share-picker returned no audio
  // track, surface a hint in the console so they can re-pick correctly.
  if (wantTabAudio && screenStream.getAudioTracks().length === 0) {
    console.warn('[Send2LLM/recorder] tab-audio was requested but the share-picker returned no audio track. ' +
      'In Chrome you must pick "Chrome Tab" (not Window or Entire Screen) AND tick "Also share tab audio".');
  }

  if (sources.includes('microphone')) {
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      const micTracks = micStream.getAudioTracks();
      console.log('[Send2LLM/recorder] mic tracks:', micTracks.map((t) => t.label));
      micTracks.forEach((t) => tracks.push(t));
    } catch (e) {
      console.error('[Send2LLM/recorder] microphone permission denied:', e);
      // Continue — the user gets a recording without mic audio, with at
      // least the screen video so the session is not lost entirely.
    }
  }

  const combinedStream = new MediaStream(tracks);
  const mimeType = pickRecorderMimeType();
  console.log('[Send2LLM/recorder] using mimeType:', mimeType,
    'total tracks:', combinedStream.getTracks().map((t) => t.kind));

  mediaRecorder = new MediaRecorder(combinedStream, { mimeType });
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
