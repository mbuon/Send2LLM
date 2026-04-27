import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import type { Db } from '../db.js';
import { getSessionById } from '../db.js';
import type { RecordingMeta } from '../types.js';

const pExecFile = promisify(execFile);

const MODEL_PATH = process.env.SEND2LLM_WHISPER_MODEL
  ?? join(homedir(), '.send2llm', 'models', 'ggml-base.en.bin');

async function have(bin: string): Promise<boolean> {
  try { await pExecFile('which', [bin]); return true; }
  catch { return false; }
}

async function transcribeOne(rec: RecordingMeta, index: number): Promise<string> {
  const webmPath = rec.path;
  if (!webmPath || !existsSync(webmPath)) return `#${index}: recording file missing: ${webmPath}`;

  const transcriptPath = join(dirname(webmPath), `transcript-${index}.txt`);
  if (existsSync(transcriptPath)) {
    const cached = readFileSync(transcriptPath, 'utf8');
    // An empty cache file means a previous run failed to produce output.
    // Retry rather than returning an empty transcript forever.
    if (cached.trim().length > 0) return `#${index}: ${cached}`;
    try { unlinkSync(transcriptPath); } catch { /* ignore */ }
  }

  if (!(await have('ffmpeg'))) return `#${index}: ffmpeg not installed.`;
  if (!(await have('whisper-cli'))) return `#${index}: whisper-cli not installed.`;
  if (!existsSync(MODEL_PATH)) return `#${index}: whisper model missing at ${MODEL_PATH}`;

  const wavPath = join(dirname(webmPath), `recording-${index}.wav`);
  try {
    await pExecFile('ffmpeg', ['-y', '-i', webmPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wavPath]);
    await pExecFile('whisper-cli', ['-m', MODEL_PATH, '-f', wavPath, '-otxt', '-nt']);
    const rawTxtPath = `${wavPath}.txt`;
    const transcript = existsSync(rawTxtPath) ? readFileSync(rawTxtPath, 'utf8').trim() : '';
    // Only cache when there's something to cache; an empty file would
    // short-circuit future retries.
    if (transcript.length > 0) writeFileSync(transcriptPath, transcript);
    try { unlinkSync(wavPath); unlinkSync(rawTxtPath); } catch { /* ignore */ }
    return `#${index}: ${transcript || '(empty transcript)'}`;
  } catch (err) {
    return `#${index}: transcription failed — ${(err as Error).message}`;
  }
}

export async function handleTranscribeRecording(db: Db, sessionId: string, index?: number): Promise<string> {
  const session = getSessionById(db, sessionId);
  if (!session) return `Session "${sessionId}" not found.`;
  const recs = session.recordings ?? [];
  if (recs.length === 0) return 'No recordings for this session.';

  if (typeof index === 'number') {
    const r = recs[index - 1];
    if (!r) return `No recording #${index} (session has ${recs.length}).`;
    return transcribeOne(r, index);
  }

  const results = await Promise.all(recs.map((r, i) => transcribeOne(r, i + 1)));
  return results.join('\n\n');
}
