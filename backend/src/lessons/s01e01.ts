import { Router } from 'express';
import { config, saveToStore } from '@ai-devs-4/general';
import {
  TASK,
  TARGET_TAG,
  fetchPeopleCsv,
  filterPeople,
  tagProfessions,
  type PersonAnswer,
} from '@ai-devs-4/s01e01';

interface LogEntry {
  message: string;
  level: 'info' | 'success' | 'warn' | 'error';
}

export interface RunResponse {
  steps: LogEntry[];
  flag?: string;
}

export const s01e01Router = Router();

s01e01Router.post('/run', async (_req, res): Promise<void> => {
  const steps: LogEntry[] = [];
  const log = (message: string, level: LogEntry['level'] = 'info'): void => {
    steps.push({ message, level });
    console.log(`[s01e01/${level}] ${message}`);
  };

  try {
    // Step 1: Fetch & parse CSV
    log('Fetching people.csv from Hub API...');
    const allPeople = await fetchPeopleCsv();
    log(`Parsed ${allPeople.length} records from CSV`);

    // Step 2: Filter
    const filtered = filterPeople(allPeople);
    log(`After filter: ${filtered.length} people matched criteria`);

    if (filtered.length === 0) {
      log('No people matched filter criteria — aborting', 'warn');
      res.json({ steps } satisfies RunResponse);
      return;
    }

    // Step 3: Tag professions (single batch LLM call)
    log(`Tagging ${filtered.length} professions via OpenAI...`);
    const tagMap = await tagProfessions(filtered);
    log(`Received tags for ${tagMap.size} professions`);

    // Step 4: Filter by transport tag
    const transportPeople: PersonAnswer[] = [];
    for (const [i, person] of filtered.entries()) {
      const tags = tagMap.get(i) ?? [];
      if (tags.includes(TARGET_TAG)) {
        transportPeople.push({
          name: person.name,
          surname: person.surname,
          gender: person.gender,
          born: person.born,
          city: person.city,
          tags,
        });
      }
    }
    log(`${transportPeople.length} people have the '${TARGET_TAG}' tag`);

    // Step 5: Save suspects for S01E02
    saveToStore('s01e01_suspects', transportPeople);
    log(`Saved ${transportPeople.length} suspects to data store`);

    // Step 6: Submit to Hub API
    log(`Submitting answer to Hub API (task: ${TASK})...`);
    const hubRes = await fetch('https://hub.ag3nts.org/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apikey: config.AIDEVS_API_KEY,
        task: TASK,
        answer: transportPeople,
      }),
    });
    const hubData = (await hubRes.json()) as { code: number; message: string };
    log(`Hub API response: ${hubData.message}`, hubData.code === 0 ? 'success' : 'warn');

    res.json({ steps, flag: hubData.message } satisfies RunResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Error: ${message}`, 'error');
    res.status(500).json({ steps } satisfies RunResponse);
  }
});
