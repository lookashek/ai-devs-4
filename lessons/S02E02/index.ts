import { fileURLToPath } from 'url';
import { z } from 'zod';
import { config, submitAnswer, resilientFetch } from '@ai-devs-4/general';
import type { HubResponse } from '@ai-devs-4/general';

// ─── Constants ───────────────────────────────────────────────────────────────

export const TASK = 'electricity';

export const GRID_POSITIONS = [
  '1x1', '1x2', '1x3',
  '2x1', '2x2', '2x3',
  '3x1', '3x2', '3x3',
] as const;

const BASE_URL = `https://hub.ag3nts.org/data/${config.AIDEVS_API_KEY}/electricity`;
const GRID_JSON_URL = `${BASE_URL}.json`;
const RESET_JSON_URL = `${GRID_JSON_URL}?reset=1`;

// ─── Key insight: JSON encoding ───────────────────────────────────────────────
// electricity.json returns a 3x3 array of integers.
// Each integer = number of CW rotations to APPLY to reach the solved state.
//
// Rotations are modulo 4 (4 rotations = full circle = no change):
//   value 0 → 0 rotations needed
//   value 1 → 1 rotation
//   value 5 → 5%4 = 1 rotation
//   value 7 → 7%4 = 3 rotations
//   value 8 → 8%4 = 0 rotations (already solved)
//
// Formula: rotations_needed = value % 4

// ─── Types ────────────────────────────────────────────────────────────────────

export type Direction = 'top' | 'right' | 'bottom' | 'left';
export type GridValues = number[][];

const GridValuesSchema = z.array(z.array(z.number()));

// ─── API helpers ──────────────────────────────────────────────────────────────

export async function resetGrid(): Promise<void> {
  console.log('[s02e02] ── RESET ──────────────────────────────────────────');
  // We ignore the reset response — it may return the pre-reset state.
  // Always follow up with a separate fetchGridJson() call.
  await resilientFetch(RESET_JSON_URL, { method: 'GET' });
  console.log('[s02e02] Reset request sent.');
}

export async function fetchGridJson(): Promise<GridValues> {
  const res = await resilientFetch(GRID_JSON_URL, { method: 'GET' });
  const data = GridValuesSchema.parse(await res.json());
  return data;
}

export async function rotateTile(position: string): Promise<HubResponse> {
  return submitAnswer({ task: TASK, answer: { rotate: position } });
}

// ─── Logging helpers ──────────────────────────────────────────────────────────

export function logGrid(grid: GridValues, label: string): void {
  console.log(`[s02e02] Grid (${label}):`);
  for (let r = 0; r < 3; r++) {
    const row = grid[r] ?? [];
    const cells = [0, 1, 2].map(c => {
      const v = row[c] ?? 0;
      const rot = (4 - (v % 4)) % 4;
      return `${r + 1}x${c + 1}:v${v}(rot${rot})`;
    });
    console.log(`[s02e02]   ${cells.join('  ')}`);
  }
}

// ─── Core logic ───────────────────────────────────────────────────────────────

export function computeRotationsFromGrid(grid: GridValues): Record<string, number> {
  const result: Record<string, number> = {};
  let totalRot = 0;

  console.log('[s02e02] ── COMPUTING ROTATIONS ────────────────────────────');
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const value = (grid[row] ?? [])[col] ?? 0;
      const position = `${row + 1}x${col + 1}`;
      const rotations = value % 4;
      result[position] = rotations;
      totalRot += rotations;
      console.log(`[s02e02]   ${position}: value=${value} → ${rotations} CW rotation(s)`);
    }
  }
  console.log(`[s02e02] Total rotations to apply: ${totalRot}`);
  return result;
}

export function isSolved(grid: GridValues): boolean {
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const v = (grid[r] ?? [])[c] ?? 0;
      if (v % 4 !== 0) return false;  // 0, 4, 8, 12 … all mean "solved" (full rotations)
    }
  }
  return true;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function applyRotations(
  rotations: Record<string, number>,
  logger: (msg: string, level?: string) => void = (m) => console.log(`[s02e02] ${m}`),
): Promise<string | undefined> {
  for (const position of GRID_POSITIONS) {
    const count = rotations[position] ?? 0;
    if (count <= 0) continue;

    for (let i = 0; i < count; i++) {
      logger(`  → rotating ${position} (${i + 1}/${count})`);
      const response = await rotateTile(position);
      logger(`    hub: code=${response.code} msg="${response.message}"`);
      if (response.message?.includes('{FLG:')) {
        return response.message;
      }
    }
  }
  return undefined;
}

export async function main(): Promise<void> {
  console.log('[s02e02] ══════════════════════════════════════════════════');
  console.log('[s02e02]  S02E02 — Electricity Grid Puzzle');
  console.log('[s02e02] ══════════════════════════════════════════════════');

  // 1. Reset grid, then fetch the actual current state separately
  await resetGrid();
  console.log('[s02e02] ── STEP 2: FETCH CURRENT STATE ───────────────────');
  const initialGrid = await fetchGridJson();
  logGrid(initialGrid, 'initial (post-reset)');

  // 3. Compute rotations directly from JSON values (no LLM needed)
  console.log('[s02e02] ── STEP 3: COMPUTE NEEDED ROTATIONS ───────────────');
  const rotations = computeRotationsFromGrid(initialGrid);

  // 4. Apply rotations
  console.log('[s02e02] ── STEP 4: APPLY ROTATIONS ─────────────────────────');
  const flag = await applyRotations(rotations);
  if (flag) {
    console.log(`[s02e02] 🏁 FLAG: ${flag}`);
    return;
  }

  // 5. Verify
  console.log('[s02e02] ── STEP 5: VERIFY ───────────────────────────────────');
  const verifyGrid = await fetchGridJson();
  logGrid(verifyGrid, 'after rotations');
  const solved = isSolved(verifyGrid);
  console.log(`[s02e02] All values ≡0 mod 4: ${solved}`);

  if (!solved) {
    console.log('[s02e02] ── STEP 5: CORRECTION ───────────────────────────────');
    const corrections = computeRotationsFromGrid(verifyGrid);
    const correctionFlag = await applyRotations(corrections);
    if (correctionFlag) {
      console.log(`[s02e02] FLAG: ${correctionFlag}`);
      return;
    }
    const finalGrid = await fetchGridJson();
    logGrid(finalGrid, 'final');
    console.log(`[s02e02] Final solved: ${isSolved(finalGrid)}`);
  } else {
    console.log('[s02e02] Grid is in solved state — waiting for flag response...');
    console.log('[s02e02] Note: flag may arrive on last rotation, not on verify.');
  }
}

// Guard: only run when executed directly
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch(err => {
    console.error('[s02e02] Fatal error:', err);
    process.exit(1);
  });
}
