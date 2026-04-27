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

/**
 * Transcribe a single .webm file with whisper.cpp and return the text. Caches
 * the result to disk next to the .webm as transcript-<index>.txt. Reusable by
 * the HTTP /sessions endpoint (server-side auto-transcription on ingest) and
 * by the MCP `transcribe_recording` tool.
 *
 * Returns an empty string when ffmpeg / whisper-cli / the model are missing.
 * Throws only on disk-IO failures; tool errors are reported by string.
 */
export async function transcribeFile(webmPath: string, index: number): Promise<string> {
  if (!webmPath || !existsSync(webmPath)) return '';

  const transcriptPath = join(dirname(webmPath), `transcript-${index}.txt`);
  if (existsSync(transcriptPath)) {
    const cached = readFileSync(transcriptPath, 'utf8');
    if (cached.trim().length > 0) return cached.trim();
    try { unlinkSync(transcriptPath); } catch { /* ignore */ }
  }

  if (!(await have('ffmpeg'))) return '';
  if (!(await have('whisper-cli'))) return '';
  if (!existsSync(MODEL_PATH)) return '';

  const wavPath = join(dirname(webmPath), `recording-${index}.wav`);
  try {
    await pExecFile('ffmpeg', ['-y', '-i', webmPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wavPath]);
    await pExecFile('whisper-cli', ['-m', MODEL_PATH, '-f', wavPath, '-otxt', '-nt']);
    const rawTxtPath = `${wavPath}.txt`;
    const transcript = existsSync(rawTxtPath) ? readFileSync(rawTxtPath, 'utf8').trim() : '';
    if (transcript.length > 0) writeFileSync(transcriptPath, transcript);
    try { unlinkSync(wavPath); unlinkSync(rawTxtPath); } catch { /* ignore */ }
    return transcript;
  } catch {
    return '';
  }
}

async function transcribeOne(rec: RecordingMeta, index: number): Promise<string> {
  if (rec.transcript && rec.transcript.trim().length > 0) return `#${index}: ${rec.transcript}`;
  const webmPath = rec.path;
  if (!webmPath || !existsSync(webmPath)) return `#${index}: recording file missing: ${webmPath}`;
  if (!(await have('ffmpeg'))) return `#${index}: ffmpeg not installed.`;
  if (!(await have('whisper-cli'))) return `#${index}: whisper-cli not installed.`;
  if (!existsSync(MODEL_PATH)) return `#${index}: whisper model missing at ${MODEL_PATH}`;
  const text = await transcribeFile(webmPath, index);
  return `#${index}: ${text || '(empty transcript)'}`;
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
