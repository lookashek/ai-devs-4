import { fileURLToPath } from 'url';
import { submitAnswer, ask } from '@ai-devs-4/general';

export const TASK = 'drone';

const POWER_PLANT_ID = 'PWR6132PL';
const DAM_COL = 2;
const DAM_ROW = 4;
const MAX_RETRIES = 5;

const DRONE_API_REFERENCE = `
DRN-BMB7 Drone API Reference

Location Control:
- setDestinationObject(ID) — Set target object. ID format: [A-Z]{3}[0-9]+[A-Z]{2} (e.g. PWR6132PL)
- set(x,y) — Landing sector on map. 1-based, (1,1) = top-left. x=column, y=row.

Engine Control:
- set(engineON) or set(engineOFF) — Toggle engines
- set(1%-100%) — Engine power level

Flight Control:
- set(1m-100m) — Flight altitude
- flyToLocation — Initiate flight (requires: altitude, target object, landing sector set beforehand)

Mission Objectives (order irrelevant, AI executes optimally):
- set(video) — Record footage
- set(image) — Capture photograph
- set(destroy) — Destroy target
- set(return) — Return to base with report

Configuration (Optional):
- setName(text) — Alphanumeric name with spaces
- setOwner(First Last) — Exactly two words
- setLed(#RRGGBB) — LED color

Diagnostics (Optional):
- selfCheck — Test onboard systems
- getFirmwareVersion — Firmware version
- getConfig — Current configuration

Calibration (Optional):
- calibrateCompass — Spatial orientation
- calibrateGPS — GPS transceiver

Service:
- hardReset — Restore factory configuration

Key Note: The DRN-BMB7 carries one small-range explosive payload.
`;

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

async function fixInstructions(currentInstructions: string[], errorMessage: string): Promise<string[]> {
  console.log(`[drone] Asking LLM to fix instructions based on error: ${errorMessage}`);

  const response = await ask(
    `Current drone instructions:\n${JSON.stringify(currentInstructions)}\n\nAPI error message:\n${errorMessage}\n\nFix the instructions based on the error. Return ONLY a JSON array of instruction strings. Keep all existing correct instructions, only add/modify/remove what the error indicates.`,
    {
      systemPrompt: `You are a drone programming expert. You fix drone instruction sets based on API error feedback.\n\nAPI Reference:\n${DRONE_API_REFERENCE}\n\nRules:\n- Return ONLY a valid JSON array of strings, no explanation\n- Keep instructions minimal — only what's needed for the mission\n- The mission is: fly to the target coordinates and destroy it, then return\n- Do not add optional configuration, diagnostics, or calibration unless the error specifically requires it`,
      temperature: 0.1,
    },
  );

  console.log(`[drone] LLM suggested fix: ${response}`);

  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error(`[drone] Could not parse JSON array from LLM response: ${response}`);

  return JSON.parse(jsonMatch[0]) as string[];
}

export async function main(): Promise<string> {
  console.log('[drone] Starting drone mission...');
  console.log(`[drone] Target: dam at col=${DAM_COL}, row=${DAM_ROW}`);

  let instructions = buildInstructions(DAM_ROW, DAM_COL);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`[drone] Attempt ${attempt}/${MAX_RETRIES}`);

    console.log('[drone] Sending hardReset...');
    await submitAnswer({ task: TASK, answer: { instructions: ['hardReset'] } });

    console.log(`[drone] Sending instructions: ${JSON.stringify(instructions)}`);

    try {
      const result = await submitAnswer({ task: TASK, answer: { instructions } });

      if (result.message.includes('{FLG:')) {
        console.log(`[drone] Flag captured: ${result.message}`);
        return result.message;
      }

      console.log(`[drone] API response (no flag): ${result.message}`);

      if (attempt < MAX_RETRIES) {
        instructions = await fixInstructions(instructions, result.message);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.log(`[drone] Error: ${errorMsg}`);

      if (attempt < MAX_RETRIES) {
        instructions = await fixInstructions(instructions, errorMsg);
      }
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
