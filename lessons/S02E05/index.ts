import { fileURLToPath } from 'url';
import { z } from 'zod';
import { config, openai, submitAnswer } from '@ai-devs-4/general';

export const TASK = 'drone';

const POWER_PLANT_ID = 'PWR6132PL';
const MAP_URL = `https://hub.ag3nts.org/data/${config.AIDEVS_API_KEY}/drone.png`;
const MAX_RETRIES = 5;

const DamLocationSchema = z.object({
  row: z.number().int().min(1),
  col: z.number().int().min(1),
  gridRows: z.number().int().min(1),
  gridCols: z.number().int().min(1),
});

type DamLocation = z.infer<typeof DamLocationSchema>;

export async function analyzeMap(): Promise<DamLocation> {
  console.log(`[drone] Analyzing map: ${MAP_URL}`);

  const response = await openai.chat.completions.create({
    model: config.OPENAI_MODEL,
    messages: [
      {
        role: 'system',
        content: `You are a map analysis expert. Analyze the terrain map image carefully. The map is divided into a grid of sectors. Your task is to:
1. Count the exact number of rows and columns in the grid
2. Find the sector containing a DAM (look for intensified blue water color at a boundary between water and land)
3. Return the dam's position using 1-based indexing where (1,1) is the top-left sector

Respond ONLY with a JSON object: {"row": <number>, "col": <number>, "gridRows": <number>, "gridCols": <number>}`,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Analyze this terrain map. Find the grid dimensions and locate the dam sector (intensified blue water at water-land boundary). Return JSON with row, col, gridRows, gridCols.',
          },
          {
            type: 'image_url',
            image_url: { url: MAP_URL, detail: 'high' },
          },
        ],
      },
    ],
    temperature: 0.1,
    max_tokens: 200,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('[drone] Vision model returned empty response');

  console.log(`[drone] Vision model response: ${content}`);

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`[drone] Could not parse JSON from response: ${content}`);

  const parsed = DamLocationSchema.parse(JSON.parse(jsonMatch[0]));
  console.log(`[drone] Dam located at row=${parsed.row}, col=${parsed.col} in ${parsed.gridRows}x${parsed.gridCols} grid`);

  return parsed;
}

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

  const location = await analyzeMap();
  let instructions = buildInstructions(location.row, location.col);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`[drone] Attempt ${attempt}/${MAX_RETRIES}`);
    console.log(`[drone] Sending instructions: ${JSON.stringify(instructions)}`);

    try {
      const result = await submitAnswer({ task: TASK, answer: { instructions } });

      if (result.message.includes('{FLG:')) {
        console.log(`[drone] Flag captured: ${result.message}`);
        return result.message;
      }

      console.log(`[drone] API response: ${result.message}`);

      if (attempt < MAX_RETRIES) {
        console.log('[drone] Adjusting based on feedback...');
        if (result.message.toLowerCase().includes('reset') || attempt > 3) {
          console.log('[drone] Sending hardReset...');
          await submitAnswer({ task: TASK, answer: { instructions: ['hardReset'] } });
          instructions = buildInstructions(location.row, location.col);
        }
      }
    } catch (err) {
      console.error(`[drone] Error on attempt ${attempt}:`, err);
      if (attempt === MAX_RETRIES) throw err;
    }
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
