import { Router } from 'express';
import {
  TASK,
  downloadLog,
  filterBySeverity,
  run,
} from '@ai-devs-4/s02e03';

interface LogEntry {
  message: string;
  level: 'info' | 'success' | 'warn' | 'error' | 'debug';
}

export interface RunResponse {
  steps: LogEntry[];
  flag?: string;
}

export const s02e03Router = Router();

s02e03Router.post('/run', async (_req, res): Promise<void> => {
  const steps: LogEntry[] = [];
  const log = (message: string, level: LogEntry['level'] = 'info'): void => {
    steps.push({ message, level });
    console.log(`[s02e03/${level}] ${message}`);
  };

  try {
    log('Starting S02E03 — Failure Log Analysis...');
    log('Running full pipeline (download → filter → compress → submit → iterate)...');

    const result = await run();

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
