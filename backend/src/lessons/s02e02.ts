import { Router } from 'express';
import {
  TASK,
  TARGET_STATE,
  GRID_POSITIONS,
  resetGrid,
  fetchGridJson,
  rotateTile,
  analyzeGridJson,
  computeAllRotations,
  type GridState,
} from '@ai-devs-4/s02e02';

interface LogEntry {
  message: string;
  level: 'info' | 'success' | 'warn' | 'error' | 'debug';
}

export interface RunResponse {
  steps: LogEntry[];
  flag?: string;
}

export const s02e02Router = Router();

s02e02Router.post('/run', async (_req, res): Promise<void> => {
  const steps: LogEntry[] = [];
  const log = (message: string, level: LogEntry['level'] = 'info'): void => {
    steps.push({ message, level });
    console.log(`[s02e02/${level}] ${message}`);
  };

  async function applyRotations(rotations: Record<string, number>): Promise<string | undefined> {
    for (const position of GRID_POSITIONS) {
      const count = rotations[position] ?? 0;
      if (count <= 0) continue;

      for (let i = 0; i < count; i++) {
        log(`Rotating tile ${position} (${i + 1}/${count})`);
        const response = await rotateTile(position);
        log(`Hub response for ${position}: code=${response.code} message="${response.message}"`, 'debug');
        if (response.message?.includes('{FLG:')) {
          return response.message;
        }
      }
    }
    return undefined;
  }

  try {
    // Target state is hardcoded (topologically verified from solved image).
    log(`Target state: ${JSON.stringify(TARGET_STATE)}`, 'debug');

    // 1. Reset grid
    log(`Resetting grid (task: ${TASK})...`);
    await resetGrid();
    log('Grid reset to initial state');

    // 2. Fetch current state from JSON
    log('Fetching current grid state from JSON...');
    const gridJson = await fetchGridJson();
    log(`Raw JSON: ${JSON.stringify(gridJson)}`, 'debug');

    // 3. Analyze JSON with LLM
    log('Analyzing JSON with GPT-4o...');
    const currentState: GridState = await analyzeGridJson(gridJson, 'current');
    log(`Current state: ${JSON.stringify(currentState)}`, 'debug');

    // 4. Compute rotations
    const rotations = computeAllRotations(currentState, TARGET_STATE, 'initial');
    log(`Rotations needed: ${JSON.stringify(rotations)}`, 'debug');

    const totalRotations = Object.values(rotations).filter(c => c > 0).reduce((a, b) => a + b, 0);
    log(`Total rotations to apply: ${totalRotations}`);

    const errors = Object.entries(rotations).filter(([, c]) => c === -1);
    if (errors.length > 0) {
      log(`Parse errors on tiles: ${errors.map(([p]) => p).join(', ')}`, 'warn');
    }

    // 5. Apply rotations
    log('Applying rotations...');
    const flag = await applyRotations(rotations);
    if (flag) {
      log(`Flag received: ${flag}`, 'success');
      res.json({ steps, flag } satisfies RunResponse);
      return;
    }

    // 6. Verify via JSON re-fetch
    log('All rotations sent. Verifying via JSON re-fetch...');
    const verifyJson = await fetchGridJson();
    log(`Verify JSON: ${JSON.stringify(verifyJson)}`, 'debug');

    const verifyState: GridState = await analyzeGridJson(verifyJson, 'verify');
    log(`Verify state: ${JSON.stringify(verifyState)}`, 'debug');

    // Per-tile match summary
    const matchSummary = GRID_POSITIONS.map(pos => {
      const cur = [...(verifyState[pos] ?? [])].sort().join(',');
      const tgt = [...(TARGET_STATE[pos] ?? [])].sort().join(',');
      return `${pos}:${cur === tgt ? '✓' : `✗(got[${cur}]want[${tgt}])`}`;
    }).join(' ');
    log(`Tile match summary: ${matchSummary}`, 'debug');

    const corrections = computeAllRotations(verifyState, TARGET_STATE, 'verify');
    const needsMore = Object.values(corrections).some(c => c > 0);

    if (needsMore) {
      log(`Corrections needed: ${JSON.stringify(corrections)}`, 'warn');
      const correctionFlag = await applyRotations(corrections);
      if (correctionFlag) {
        log(`Flag received: ${correctionFlag}`, 'success');
        res.json({ steps, flag: correctionFlag } satisfies RunResponse);
        return;
      }
    }

    log('Grid appears correct but no flag received — target state may be wrong.', 'warn');
    res.json({ steps } satisfies RunResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Error: ${message}`, 'error');
    res.status(500).json({ steps } satisfies RunResponse);
  }
});
