import { Router } from 'express';
import { TASK, buildDeclaration } from '@ai-devs-4/s01e04';
import { config } from '@ai-devs-4/general';

interface LogEntry {
  message: string;
  level: 'info' | 'success' | 'warn' | 'error';
}

export interface RunResponse {
  steps: LogEntry[];
  flag?: string;
}

export const s01e04Router = Router();

s01e04Router.post('/run', async (_req, res): Promise<void> => {
  const steps: LogEntry[] = [];
  const log = (message: string, level: LogEntry['level'] = 'info'): void => {
    steps.push({ message, level });
    console.log(`[s01e04/${level}] ${message}`);
  };

  try {
    log('Building transport declaration...');
    const declaration = buildDeclaration();
    log('Declaration built successfully');
    log(`Route: X-01 (Gdańsk → Żarnowiec)`);
    log(`Category: A (Strategiczna) — 0 PP`);

    log(`Submitting answer (task: ${TASK})...`);
    const hubRes = await fetch('https://hub.ag3nts.org/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apikey: config.AIDEVS_API_KEY, task: TASK, answer: declaration }),
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
