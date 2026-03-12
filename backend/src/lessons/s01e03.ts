import { Router } from 'express';
import { config } from '@ai-devs-4/general';
import { TASK } from '@ai-devs-4/s01e03';

const HUB_URL = 'https://hub.ag3nts.org';

interface LogEntry {
  message: string;
  level: 'info' | 'success' | 'warn' | 'error';
}

export interface RunResponse {
  steps: LogEntry[];
  flag?: string;
}

export const s01e03Router = Router();

s01e03Router.post('/run', async (req, res): Promise<void> => {
  const steps: LogEntry[] = [];
  const log = (message: string, level: LogEntry['level'] = 'info'): void => {
    steps.push({ message, level });
    console.log(`[s01e03/${level}] ${message}`);
  };

  try {
    const body = req.body as { url?: string; sessionID?: string };
    const { url, sessionID = 'hub-test-session' } = body;

    if (!url) {
      log('Missing required field: url (public ngrok/tunnel URL)', 'error');
      res.status(400).json({ steps } satisfies RunResponse);
      return;
    }

    log(`Submitting proxy endpoint to Hub API (task: ${TASK})`);
    log(`Endpoint URL: ${url}`);
    log(`Session ID: ${sessionID}`);

    const answer = { url, sessionID };

    const hubRes = await fetch(`${HUB_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apikey: config.AIDEVS_API_KEY, task: TASK, answer }),
    });
    const hubData = (await hubRes.json()) as { code: number; message: string };
    log(`Hub response: ${hubData.message}`, hubData.code === 0 ? 'success' : 'warn');

    res.json({ steps, flag: hubData.message } satisfies RunResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Error: ${message}`, 'error');
    res.status(500).json({ steps } satisfies RunResponse);
  }
});
