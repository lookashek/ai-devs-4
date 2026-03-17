import { config, submitAnswer, resilientFetch } from '@ai-devs-4/general';
import { z } from 'zod';

// ─── Constants ───────────────────────────────────────────────────────────────

export const TASK = 'categorize';
const CSV_URL = `https://hub.ag3nts.org/data/${config.AIDEVS_API_KEY}/categorize.csv`;
const MAX_RETRIES = 3;

// Static prompt prefix — kept constant across all items for cache efficiency.
// Variable data (id, description) appended at the end.
// Must be very short to stay under 100 tokens total (prefix + item data).
const PROMPT_PREFIX =
  'DNG or NEU? Reactor/nuclear→NEU always. Weapon,rifle,explosive,toxic,radioactive,hatchet→DNG. Else→NEU.';

// ─── Types ───────────────────────────────────────────────────────────────────

const CsvRowSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
});

type CsvRow = z.infer<typeof CsvRowSchema>;

// ─── Functions ───────────────────────────────────────────────────────────────

/** Reset hub budget counter */
export async function resetBudget(): Promise<void> {
  console.log(`[${TASK}] Resetting budget...`);
  const result = await submitAnswer({ task: TASK, answer: { prompt: 'reset' } });
  console.log(`[${TASK}] Reset response:`, result.message);
}

/** Fetch and parse CSV with item data */
export async function fetchItems(): Promise<CsvRow[]> {
  console.log(`[${TASK}] Fetching CSV from hub...`);
  const res = await resilientFetch(CSV_URL, { method: 'GET' });

  if (!res.ok) {
    throw new Error(`[${TASK}] Failed to fetch CSV: HTTP ${res.status}`);
  }

  const text = await res.text();
  console.log(`[${TASK}] Raw CSV:\n${text}`);

  const lines = text.trim().split('\n');
  // Skip header row
  const dataLines = lines.slice(1);

  const items: CsvRow[] = [];
  for (const line of dataLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // CSV format: id,"description" — descriptions may be quoted
    const commaIdx = trimmed.indexOf(',');
    if (commaIdx === -1) {
      console.warn(`[${TASK}] Skipping malformed line: ${trimmed}`);
      continue;
    }

    const id = trimmed.slice(0, commaIdx).trim();
    const rawDesc = trimmed.slice(commaIdx + 1).trim();
    // Strip surrounding quotes if present
    const description = rawDesc.startsWith('"') && rawDesc.endsWith('"')
      ? rawDesc.slice(1, -1)
      : rawDesc;

    const parsed = CsvRowSchema.safeParse({ id, description });
    if (!parsed.success) {
      console.warn(`[${TASK}] Skipping invalid row:`, parsed.error.flatten());
      continue;
    }

    items.push(parsed.data);
  }

  console.log(`[${TASK}] Parsed ${items.length} items`);
  return items;
}

/** Build classification prompt for a single item */
export function buildPrompt(item: CsvRow): string {
  return `${PROMPT_PREFIX} ID:${item.id} DESC:${item.description}`;
}

/** Submit classification prompt for one item */
export async function classifyItem(item: CsvRow): Promise<string> {
  const prompt = buildPrompt(item);
  console.log(`[${TASK}] Classifying item ${item.id}: "${item.description}"`);
  console.log(`[${TASK}] Prompt (${prompt.length} chars): ${prompt}`);

  const result = await submitAnswer({ task: TASK, answer: { prompt } });
  console.log(`[${TASK}] Item ${item.id} result: ${result.message}`);
  return result.message;
}

/** Run the full classification cycle: reset → fetch → classify all */
export async function runClassificationCycle(): Promise<string | undefined> {
  await resetBudget();
  const items = await fetchItems();

  if (items.length === 0) {
    throw new Error(`[${TASK}] No items found in CSV`);
  }

  let flag: string | undefined;

  for (const item of items) {
    const message = await classifyItem(item);

    // Check for flag in response
    const flagMatch = message.match(/\{FLG:[^}]+\}/);
    if (flagMatch) {
      flag = flagMatch[0];
      console.log(`[${TASK}] FLAG FOUND: ${flag}`);
    }

    // Check for failure — stop immediately to save budget
    if (message.includes('NOT ACCEPTED') || message.includes('Insufficient funds')) {
      console.error(`[${TASK}] Classification failed: ${message}`);
      return undefined;
    }
  }

  return flag;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`[${TASK}] Starting categorization task...`);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`\n[${TASK}] === Attempt ${attempt}/${MAX_RETRIES} ===`);

    try {
      const flag = await runClassificationCycle();

      if (flag) {
        console.log(`\n[${TASK}] SUCCESS! Flag: ${flag}`);
        return;
      }

      console.log(`[${TASK}] No flag received, will retry...`);
    } catch (err) {
      console.error(`[${TASK}] Attempt ${attempt} failed:`, err);
    }
  }

  console.error(`[${TASK}] Failed after ${MAX_RETRIES} attempts`);
}

// Run only when executed directly
const isMain = process.argv[1]?.includes('S02E01');
if (isMain) {
  main().catch(console.error);
}
