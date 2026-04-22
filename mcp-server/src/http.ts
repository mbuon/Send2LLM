// mcp-server/src/http.ts
import express, { type Express } from 'express';
import type { Db } from './db.js';
import { insertSession } from './db.js';
import { saveBase64Asset } from './storage.js';
import type { Session } from './types.js';

export function createHttpApp(db: Db, storageRoot: string): Express {
  const app = express();
  app.use(express.json({ limit: '200mb' }));

  app.post('/sessions', async (req, res) => {
    const { session, fullPageScreenshotBase64, elementScreenshots } = req.body as {
      session?: Session;
      fullPageScreenshotBase64?: string | null;
      elementScreenshots?: Record<string, string>;
    };

    if (!session || !session.id) {
      res.status(400).json({ error: 'Missing session' });
      return;
    }

    try {
      if (fullPageScreenshotBase64) {
        session.fullPageScreenshotPath = await saveBase64Asset(
          storageRoot, session.id, 'full-page.png', fullPageScreenshotBase64,
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
      insertSession(db, session);
      res.status(201).json({ id: session.id });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  return app;
}
