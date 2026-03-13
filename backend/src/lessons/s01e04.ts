import { Router } from 'express';
import { run } from '@ai-devs-4/s01e04';
import type { LogEntry } from '@ai-devs-4/s01e04';

export interface RunResponse {
  steps: LogEntry[];
  flag?: string;
}

export const s01e04Router = Router();

s01e04Router.post('/run', async (_req, res): Promise<void> => {
  try {
    const { steps, flag } = await run();
    res.json({ steps, flag } satisfies RunResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[s01e04] Error:', message);
    res.status(500).json({ steps: [{ message, level: 'error' }] } satisfies RunResponse);
  }
});
