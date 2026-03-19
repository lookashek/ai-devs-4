import { Router } from 'express';
import { TASK, main } from '@ai-devs-4/s02e04';

interface LogEntry {
  message: string;
  level: 'info' | 'success' | 'warn' | 'error' | 'debug';
}

export interface RunResponse {
  steps: LogEntry[];
  flag?: string;
}

export const s02e04Router = Router();

s02e04Router.post('/run', async (_req, res): Promise<void> => {
  const steps: LogEntry[] = [];
  const log = (message: string, level: LogEntry['level'] = 'info'): void => {
    steps.push({ message, level });
    console.log(`[s02e04/${level}] ${message}`);
  };

  try {
    log('Starting S02E04 — Mailbox Search...');
    log('Searching operator inbox for date, password, and confirmation code...');

    const result = await main();

    const flagMatch = result.match(/\{FLG:[^}]+\}/);
    if (flagMatch) {
      log(`Flag received: ${flagMatch[0]}`, 'success');
      res.json({ steps, flag: flagMatch[0] } satisfies RunResponse);
    } else {
      log(`Result: ${result}`, 'warn');
      res.json({ steps } satisfies RunResponse);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Error: ${message}`, 'error');
    res.status(500).json({ steps } satisfies RunResponse);
  }
});
