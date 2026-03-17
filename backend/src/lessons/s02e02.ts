import { Router } from 'express';
import {
  TASK,
  GRID_POSITIONS,
  resetGrid,
  fetchGridJson,
  fetchSolvedImage,
  rotateTile,
  analyzeGridJson,
  analyzeGridImage,
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
    // 1. Derive target state from solved image
    log('Fetching solved image to derive target state...');
    const solvedImage = await fetchSolvedImage();
    const targetState: GridState = await analyzeGridImage(solvedImage, 'target');
    log(`Target state derived: ${JSON.stringify(targetState)}`, 'debug');

    // 2. Reset grid
    log(`Resetting grid (task: ${TASK})...`);
    await resetGrid();
    log('Grid reset to initial state');

    // 3. Fetch current state from JSON (no vision needed)
    log('Fetching current grid state from JSON...');
    const gridJson = await fetchGridJson();
    log(`Raw JSON: ${JSON.stringify(gridJson)}`, 'debug');

    // 4. Analyze JSON with LLM
    log('Analyzing JSON with GPT-4o...');
    const currentState: GridState = await analyzeGridJson(gridJson, 'current');
    log(`Current state: ${JSON.stringify(currentState)}`, 'debug');

    // 5. Compute rotations
    const rotations = computeAllRotations(currentState, targetState, 'initial');
    log(`Rotations needed: ${JSON.stringify(rotations)}`, 'debug');

    const totalRotations = Object.values(rotations).filter(c => c > 0).reduce((a, b) => a + b, 0);
    log(`Total rotations to apply: ${totalRotations}`);

    const errors = Object.entries(rotations).filter(([, c]) => c === -1);
    if (errors.length > 0) {
      log(`Parse errors on tiles: ${errors.map(([p]) => p).join(', ')}`, 'warn');
    }

    // 6. Apply rotations
    log('Applying rotations...');
    const flag = await applyRotations(rotations);
    if (flag) {
      log(`Flag received: ${flag}`, 'success');
      res.json({ steps, flag } satisfies RunResponse);
      return;
    }

    // 7. Verify via JSON re-fetch
    log('All rotations sent. Verifying via JSON re-fetch...');
    const verifyJson = await fetchGridJson();
    log(`Verify JSON: ${JSON.stringify(verifyJson)}`, 'debug');

    const verifyState: GridState = await analyzeGridJson(verifyJson, 'verify');
    log(`Verify state: ${JSON.stringify(verifyState)}`, 'debug');

    // Per-tile match summary
    const matchSummary = GRID_POSITIONS.map(pos => {
      const cur = [...(verifyState[pos] ?? [])].sort().join(',');
      const tgt = [...(targetState[pos] ?? [])].sort().join(',');
      return `${pos}:${cur === tgt ? '✓' : `✗(got[${cur}]want[${tgt}])`}`;
    }).join(' ');
    log(`Tile match summary: ${matchSummary}`, 'debug');

    const corrections = computeAllRotations(verifyState, targetState, 'verify');
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
