import { Router } from 'express';
import {
  TASK,
  GRID_POSITIONS,
  resetGrid,
  fetchGridImage,
  fetchSolvedImage,
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
    // 1. Fetch and analyze solved image to derive target state
    log('Fetching solved image to derive target state...');
    const solvedImage = await fetchSolvedImage();
    const targetState: GridState = await analyzeGrid(solvedImage, 'target');
    log(`Target state derived`, 'success');
    log(`Target state: ${JSON.stringify(targetState)}`, 'debug');

    // 2. Reset grid
    log(`Resetting grid (task: ${TASK})...`);
    await resetGrid();
    log('Grid reset to initial state');

    // 3. Fetch current image
    log('Fetching current grid image...');
    const gridImage = await fetchGridImage();
    log('Grid image fetched');

    // 4. Analyze with vision
    log('Analyzing current grid via GPT-4o vision...');
    const currentState: GridState = await analyzeGrid(gridImage, 'current');
    log(`Vision analysis complete`, 'success');
    log(`Current state: ${JSON.stringify(currentState)}`, 'debug');

    // 5. Compute rotations
    const rotations = computeAllRotations(currentState, targetState);
    log(`Rotations needed: ${JSON.stringify(rotations)}`, 'debug');

    const totalRotations = Object.values(rotations).filter(c => c > 0).reduce((a, b) => a + b, 0);
    log(`Total rotations to apply: ${totalRotations}`);

    // 6. Warn on vision errors
    const errors = Object.entries(rotations).filter(([, c]) => c === -1);
    if (errors.length > 0) {
      log(`Vision errors on tiles: ${errors.map(([p]) => p).join(', ')}`, 'warn');
    }

    // 7. Apply rotations
    log('Applying rotations...');
    const flag = await applyRotations(rotations);
    if (flag) {
      log(`Flag received: ${flag}`, 'success');
      res.json({ steps, flag } satisfies RunResponse);
      return;
    }

    // 8. Verify
    log('All rotations sent. Re-fetching for verification...');
    const verifyImage = await fetchGridImage();
    const verifyState = await analyzeGrid(verifyImage, 'verify');
    const corrections = computeAllRotations(verifyState, targetState);
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
        const nextState = await analyzeGrid(nextImage, `verify-${round}`);
        pendingCorrections = computeAllRotations(nextState, targetState);
      }
    }

    log('Grid appears correct but no flag received.', 'warn');
    res.json({ steps } satisfies RunResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Error: ${message}`, 'error');
    res.status(500).json({ steps } satisfies RunResponse);
  }
});
