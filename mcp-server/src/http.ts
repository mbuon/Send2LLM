// mcp-server/src/http.ts
import express, { type Express } from 'express';
import type { Db } from './db.js';
import { insertSession } from './db.js';
import { saveBase64Asset } from './storage.js';
import type { Session } from './types.js';

export function createHttpApp(db: Db, storageRoot: string): Express {
  const app = express();
  app.use(express.json({ limit: '200mb' }));

  // Content-script fetch uses page CORS. Permit any origin for this local-only
  // server — it binds to 127.0.0.1 by default so exposure is limited.
  app.use((req, res, next) => {
    // Echo the origin rather than '*' so Chrome's Private Network Access
    // preflight (triggered when a public origin fetches 127.0.0.1) has a
    // concrete allow-origin to match against. '*' is not accepted by PNA.
    const origin = req.headers.origin;
    if (typeof origin === 'string') {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Access-Control-Request-Private-Network');
    // Chrome 117+ requires this for fetches from public/https pages to
    // loopback. Without it the OPTIONS preflight fails before reaching POST.
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    next();
  });

  app.post('/sessions', async (req, res) => {
    const { session, fullPageScreenshotBase64, elementScreenshots, recordingsBase64 } = req.body as {
      session?: Session;
      fullPageScreenshotBase64?: string | null;
      elementScreenshots?: Record<string, string>;
      recordingsBase64?: string[];
    };

    if (!session || !session.id) {
      res.status(400).json({ error: 'Missing session' });
      return;
    }

    try {
      if (fullPageScreenshotBase64) {
        session.fullPageScreenshotPath = await saveBase64Asset(
          storageRoot, session.id, 'full-page.jpg', fullPageScreenshotBase64,
        );
      }
      if (elementScreenshots) {
        for (const [annotationId, base64] of Object.entries(elementScreenshots)) {
          const ann = session.annotations.find((a) => a.id === annotationId);
          if (ann && base64) {
            ann.elementScreenshotPath = await saveBase64Asset(
              storageRoot, session.id, `element-${ann.number}.png`, base64,
            );
          }
        }
      }
      if (recordingsBase64 && session.recordings) {
        for (let i = 0; i < session.recordings.length; i++) {
          const b64 = recordingsBase64[i];
          if (!b64) continue;
          const filename = `recording-${i + 1}.webm`;
          const path = await saveBase64Asset(storageRoot, session.id, filename, b64);
          session.recordings[i].path = path;
          session.recordings[i].filename = filename;
        }
      }
      insertSession(db, session);
      res.status(201).json({ id: session.id });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  return app;
}
