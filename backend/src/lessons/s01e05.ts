import { Router } from 'express';
import { runRailwayTask, type LogEntry } from '@ai-devs-4/s01e05';

export interface RunResponse {
  steps: LogEntry[];
  flag?: string;
}

export const s01e05Router = Router();

s01e05Router.post('/run', async (_req, res): Promise<void> => {
  const steps: LogEntry[] = [];
  const log = (message: string, level: LogEntry['level'] = 'info'): void => {
    steps.push({ message, level });
    console.log(`[s01e05/${level}] ${message}`);
  };

  try {
    log('Starting Railway Route Activation task (S01E05)...');

    const result = await runRailwayTask(log);

    const message = result.message ?? JSON.stringify(result);
    const flag = typeof message === 'string' && message.includes('{FLG:') ? message : undefined;

    if (flag) {
      log(`Task complete! Flag: ${flag}`, 'success');
    } else {
      log('Task finished — check response above for details', 'warn');
    }

    res.json({ steps, flag } satisfies RunResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Error: ${message}`, 'error');
    res.status(500).json({ steps } satisfies RunResponse);
  }
});
