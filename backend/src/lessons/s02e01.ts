import { Router } from 'express';
import { config } from '@ai-devs-4/general';
import {
  TASK,
  resetBudget,
  fetchItems,
  buildPrompt,
} from '@ai-devs-4/s02e01';

interface LogEntry {
  message: string;
  level: 'info' | 'success' | 'warn' | 'error';
}

export interface RunResponse {
  steps: LogEntry[];
  flag?: string;
}

export const s02e01Router = Router();

s02e01Router.post('/run', async (_req, res): Promise<void> => {
  const steps: LogEntry[] = [];
  const log = (message: string, level: LogEntry['level'] = 'info'): void => {
    steps.push({ message, level });
    console.log(`[s02e01/${level}] ${message}`);
  };

  try {
    // Step 1: Reset budget
    log('Resetting classification budget...');
    await resetBudget();
    log('Budget reset complete');

    // Step 2: Fetch CSV items
    log('Fetching item CSV from Hub API...');
    const items = await fetchItems();
    log(`Parsed ${items.length} items from CSV`);

    if (items.length === 0) {
      log('No items found in CSV — aborting', 'warn');
      res.json({ steps } satisfies RunResponse);
      return;
    }

    // Step 3: Classify each item
    let lastMessage = '';
    for (const item of items) {
      const prompt = buildPrompt(item);
      log(`Classifying item ${item.id}: "${item.description}"`);

      const hubRes = await fetch('https://hub.ag3nts.org/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apikey: config.AIDEVS_API_KEY,
          task: TASK,
          answer: { prompt },
        }),
      });
      const hubData = (await hubRes.json()) as { code: number; message: string };
      lastMessage = hubData.message;

      const level = hubData.code === 0 ? 'success' : 'warn';
      log(`Item ${item.id}: ${hubData.message}`, level);
    }

    // Check for flag in last response
    const flagMatch = lastMessage.match(/\{FLG:[^}]+\}/);
    const flag = flagMatch ? flagMatch[0] : lastMessage;

    res.json({ steps, flag } satisfies RunResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Error: ${message}`, 'error');
    res.status(500).json({ steps } satisfies RunResponse);
  }
});
