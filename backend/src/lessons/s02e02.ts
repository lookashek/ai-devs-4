import { Router } from 'express';
import {
  TASK,
  TARGET_STATE,
  GRID_POSITIONS,
  resetGrid,
  fetchGridImage,
  rotateTile,
  analyzeGrid,
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
        log(`Hub response: ${response.message}`, 'debug');
        if (response.message?.includes('{FLG:')) {
          return response.message;
        }
      }
    }
    return undefined;
  }

  try {
    // 1. Reset grid
    log(`Resetting grid (task: ${TASK})...`);
    await resetGrid();
    log('Grid reset to initial state');

    // 2. Fetch current image
    log('Fetching current grid image...');
    const gridImage = await fetchGridImage();
    log('Grid image fetched');

    // 3. Analyze with vision
    log('Analyzing grid tiles via GPT-4o vision...');
    const currentState: GridState = await analyzeGrid(gridImage);
    log(`Vision analysis complete`, 'success');
    log(`Current state: ${JSON.stringify(currentState)}`, 'debug');

    // 4. Compute rotations
    const rotations = computeAllRotations(currentState, TARGET_STATE);
    log(`Rotations needed: ${JSON.stringify(rotations)}`, 'debug');

    const totalRotations = Object.values(rotations).filter(c => c > 0).reduce((a, b) => a + b, 0);
    log(`Total rotations to apply: ${totalRotations}`);

    // 5. Warn on vision errors
    const errors = Object.entries(rotations).filter(([, c]) => c === -1);
    if (errors.length > 0) {
      log(`Vision errors on tiles: ${errors.map(([p]) => p).join(', ')}`, 'warn');
    }

    // 6. Apply rotations
    log('Applying rotations...');
    const flag = await applyRotations(rotations);
    if (flag) {
      log(`Flag received: ${flag}`, 'success');
      res.json({ steps, flag } satisfies RunResponse);
      return;
    }

    // 7. Verify
    log('All rotations sent. Re-fetching for verification...');
    const verifyImage = await fetchGridImage();
    const verifyState = await analyzeGrid(verifyImage);
    const corrections = computeAllRotations(verifyState, TARGET_STATE);
    const needsMore = Object.values(corrections).some(c => c > 0);

    if (needsMore) {
      log(`Corrections needed: ${JSON.stringify(corrections)}`, 'warn');
      let pendingCorrections = corrections;
      const MAX_ROUNDS = 2;

      for (let round = 1; round <= MAX_ROUNDS; round++) {
        if (!Object.values(pendingCorrections).some(c => c > 0)) break;

        log(`Correction round ${round}...`);
        const correctionFlag = await applyRotations(pendingCorrections);
        if (correctionFlag) {
          log(`Flag received: ${correctionFlag}`, 'success');
          res.json({ steps, flag: correctionFlag } satisfies RunResponse);
          return;
        }

        const nextImage = await fetchGridImage();
        const nextState = await analyzeGrid(nextImage);
        pendingCorrections = computeAllRotations(nextState, TARGET_STATE);
      }
    }

    log('Grid appears correct but no flag received. Verify TARGET_STATE.', 'warn');
    res.json({ steps } satisfies RunResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Error: ${message}`, 'error');
    res.status(500).json({ steps } satisfies RunResponse);
  }
});
