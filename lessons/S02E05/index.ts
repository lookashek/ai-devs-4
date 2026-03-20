import { fileURLToPath } from 'url';
import { submitAnswer } from '@ai-devs-4/general';

export const TASK = 'drone';

const POWER_PLANT_ID = 'PWR6132PL';
const DAM_COL = 2;
const DAM_ROW = 4;
const MAX_RETRIES = 5;

export function buildInstructions(row: number, col: number): string[] {
  return [
    `setDestinationObject(${POWER_PLANT_ID})`,
    `set(${col},${row})`,
    'set(engineON)',
    'set(100%)',
    'set(50m)',
    'set(destroy)',
    'flyToLocation',
  ];
}

export async function main(): Promise<string> {
  console.log('[drone] Starting drone mission...');
  console.log(`[drone] Target: dam at col=${DAM_COL}, row=${DAM_ROW}`);

  const instructions = buildInstructions(DAM_ROW, DAM_COL);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`[drone] Attempt ${attempt}/${MAX_RETRIES}`);

    console.log('[drone] Sending hardReset...');
    await submitAnswer({ task: TASK, answer: { instructions: ['hardReset'] } });

    console.log(`[drone] Sending instructions: ${JSON.stringify(instructions)}`);
    const result = await submitAnswer({ task: TASK, answer: { instructions } });

    if (result.message.includes('{FLG:')) {
      console.log(`[drone] Flag captured: ${result.message}`);
      return result.message;
    }

    console.log(`[drone] API response: ${result.message}`);
  }

  throw new Error('[drone] Failed after maximum retries');
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch(err => {
    console.error('[drone] Fatal error:', err);
    process.exit(1);
  });
}
