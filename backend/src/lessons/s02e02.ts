import { Router } from 'express';
import {
  TASK,
  GRID_POSITIONS,
  resetGrid,
  fetchGridJson,
  rotateTile,
  computeRotationsFromGrid,
  isSolved,
  logGrid,
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
        log(`Rotating ${position} (${i + 1}/${count})`);
        const response = await rotateTile(position);
        log(`  → hub: code=${response.code} msg="${response.message}"`, 'debug');
        if (response.message?.includes('{FLG:')) {
          return response.message;
        }
      }
    }
    return undefined;
  }

  try {
    // 1. Reset grid
    log(`[1/4] Resetting grid (task: ${TASK})...`);
    const initialGrid = await resetGrid();
    log(`Initial grid: ${JSON.stringify(initialGrid)}`, 'debug');

    // 2. Compute rotations directly from JSON values — NO LLM NEEDED.
    // Each value v = CW rotations applied from solved state.
    // Rotations needed = (4 - v%4) % 4.
    log('[2/4] Computing rotations from grid values...');
    const rotations = computeRotationsFromGrid(initialGrid);

    const rotationSummary = GRID_POSITIONS
      .filter(p => (rotations[p] ?? 0) > 0)
      .map(p => `${p}:${rotations[p]}`)
      .join(', ');
    log(`Rotations needed: ${rotationSummary || 'none'}`);

    const total = Object.values(rotations).reduce((s, v) => s + v, 0);
    log(`Total CW rotations to apply: ${total}`);

    // 3. Apply rotations
    log('[3/4] Applying rotations...');
    const flag = await applyRotations(rotations);
    if (flag) {
      log(`Flag received: ${flag}`, 'success');
      res.json({ steps, flag } satisfies RunResponse);
      return;
    }

    // 4. Verify
    log('[4/4] Verifying result...');
    const verifyGrid = await fetchGridJson();
    log(`Verify grid: ${JSON.stringify(verifyGrid)}`, 'debug');
    logGrid(verifyGrid, 'verify');

    const solved = isSolved(verifyGrid);
    log(`All values ≡ 0 mod 4: ${solved}`, solved ? 'success' : 'warn');

    if (!solved) {
      log('Applying corrections...', 'warn');
      const corrections = computeRotationsFromGrid(verifyGrid);
      const corrSummary = GRID_POSITIONS
        .filter(p => (corrections[p] ?? 0) > 0)
        .map(p => `${p}:${corrections[p]}`)
        .join(', ');
      log(`Correction rotations: ${corrSummary}`);

      const correctionFlag = await applyRotations(corrections);
      if (correctionFlag) {
        log(`Flag received: ${correctionFlag}`, 'success');
        res.json({ steps, flag: correctionFlag } satisfies RunResponse);
        return;
      }

      const finalGrid = await fetchGridJson();
      log(`Final grid: ${JSON.stringify(finalGrid)}`, 'debug');
      log(`Final solved: ${isSolved(finalGrid)}`, isSolved(finalGrid) ? 'success' : 'warn');
    } else {
      log('Grid is in solved state.', 'success');
    }

    log('Done. Flag may have been returned on last rotation.', 'warn');
    res.json({ steps } satisfies RunResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Error: ${message}`, 'error');
    res.status(500).json({ steps } satisfies RunResponse);
  }
});
