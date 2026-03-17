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
// Each integer = number of CW rotations applied to that tile FROM its solved state.
//
// Proof: tile 3x2 had value 7. After 1 CW rotation → value 0.
//        (7 + 1) % 4 = 0 ✓  (period 4 for all non-symmetric tiles)
//
// Formula: rotations_needed = (4 - value % 4) % 4
//
// This works for ALL tile types:
//   period-4 (L-bend, T-junction, dead-end): exact
//   period-2 (straight): over-rotates by 2, but 2≡0 mod 2 → still reaches solved
//   period-1 (cross): 0 rotations always needed → formula gives 0 when value%4=0
//
// The solved state for each tile = value ≡ 0 (mod 4).

// ─── Types ────────────────────────────────────────────────────────────────────

export type Direction = 'top' | 'right' | 'bottom' | 'left';
export type GridValues = number[][];

const GridValuesSchema = z.array(z.array(z.number()));

// ─── API helpers ──────────────────────────────────────────────────────────────

export async function resetGrid(): Promise<GridValues> {
  console.log('[s02e02] ── RESET ──────────────────────────────────────────');
  const res = await resilientFetch(RESET_JSON_URL, { method: 'GET' });
  const data = GridValuesSchema.parse(await res.json());
  console.log('[s02e02] Grid reset. State after reset:');
  logGrid(data, 'after reset');
  return data;
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
      const rotations = (4 - (value % 4)) % 4;
      result[position] = rotations;
      totalRot += rotations;
      console.log(`[s02e02]   ${position}: value=${value} (v%4=${value % 4}) → needs ${rotations} CW rotation(s)`);
    }
  }
  console.log(`[s02e02] Total rotations to apply: ${totalRot}`);
  return result;
}

export function isSolved(grid: GridValues): boolean {
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const v = (grid[r] ?? [])[c] ?? 0;
      if (v % 4 !== 0) return false;
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

  // 1. Reset grid
  const initialGrid = await resetGrid();

  // 2. Compute rotations directly from JSON values (no LLM needed)
  console.log('[s02e02] ── STEP 2: COMPUTE NEEDED ROTATIONS ───────────────');
  const rotations = computeRotationsFromGrid(initialGrid);

  // 3. Apply rotations
  console.log('[s02e02] ── STEP 3: APPLY ROTATIONS ─────────────────────────');
  const flag = await applyRotations(rotations);
  if (flag) {
    console.log(`[s02e02] 🏁 FLAG: ${flag}`);
    return;
  }

  // 4. Verify
  console.log('[s02e02] ── STEP 4: VERIFY ───────────────────────────────────');
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
