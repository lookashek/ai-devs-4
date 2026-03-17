import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { z } from 'zod';
import { config, openai, submitAnswer, resilientFetch } from '@ai-devs-4/general';
import type { HubResponse } from '@ai-devs-4/general';

// ─── Constants ───────────────────────────────────────────────────────────────

export const TASK = 'electricity';

export const GRID_POSITIONS = [
  '1x1', '1x2', '1x3',
  '2x1', '2x2', '2x3',
  '3x1', '3x2', '3x3',
] as const;

const GRID_IMAGE_URL = `https://hub.ag3nts.org/data/${config.AIDEVS_API_KEY}/electricity.png`;
const RESET_URL = `${GRID_IMAGE_URL}?reset=1`;

// ─── Types ────────────────────────────────────────────────────────────────────

export type Direction = 'top' | 'right' | 'bottom' | 'left';
export type TileState = Direction[];
export type GridState = Record<string, TileState>;

const DirectionArraySchema = z.array(z.enum(['top', 'right', 'bottom', 'left']));
const GridStateSchema = z.record(z.string(), DirectionArraySchema);

const SOLVED_IMAGE_URL = 'https://hub.ag3nts.org/i/solved_electricity.png';

// ─── API helpers ──────────────────────────────────────────────────────────────

export async function resetGrid(): Promise<Buffer> {
  console.log('[s02e02] Resetting grid...');
  const res = await resilientFetch(RESET_URL, { method: 'GET' });
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function fetchGridImage(): Promise<Buffer> {
  console.log('[s02e02] Fetching current grid image...');
  const res = await resilientFetch(GRID_IMAGE_URL, { method: 'GET' });
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function rotateTile(position: string): Promise<HubResponse> {
  console.log(`[s02e02] Rotating tile ${position}`);
  return submitAnswer({ task: TASK, answer: { rotate: position } });
}

export async function fetchSolvedImage(): Promise<Buffer> {
  console.log('[s02e02] Fetching solved (target) image...');
  const res = await resilientFetch(SOLVED_IMAGE_URL, { method: 'GET' });
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ─── Image processing ─────────────────────────────────────────────────────────
// cropTiles is kept as a utility; primary analysis uses the full-image approach below.

export async function cropTiles(imageBuffer: Buffer): Promise<Map<string, Buffer>> {
  const metadata = await sharp(imageBuffer).metadata();
  const { width = 0, height = 0 } = metadata;

  const tileWidth = Math.floor(width / 3);
  const tileHeight = Math.floor(height / 3);

  const tiles = new Map<string, Buffer>();

  for (let row = 1; row <= 3; row++) {
    for (let col = 1; col <= 3; col++) {
      const left = (col - 1) * tileWidth;
      const top = (row - 1) * tileHeight;
      const w = col === 3 ? width - left : tileWidth;
      const h = row === 3 ? height - top : tileHeight;

      const tileBuffer = await sharp(imageBuffer)
        .extract({ left, top, width: w, height: h })
        .toBuffer();

      tiles.set(`${row}x${col}`, tileBuffer);
    }
  }

  return tiles;
}

// ─── Vision analysis ──────────────────────────────────────────────────────────

const GRID_VISION_PROMPT = `This is a 3x3 electrical cable grid puzzle.

The grid has 9 cells arranged in 3 rows and 3 columns:
- Row 1 (top row):    positions 1x1 (left), 1x2 (center), 1x3 (right)
- Row 2 (middle row): positions 2x1 (left), 2x2 (center), 2x3 (right)
- Row 3 (bottom row): positions 3x1 (left), 3x2 (center), 3x3 (right)

Each cell contains a cable connector piece. The thick dark lines show the cable path.
The cable can exit through any combination of the cell's 4 edges: top, right, bottom, left.

Cable types:
- Straight: 2 opposite edges (e.g. left+right, or top+bottom)
- L-bend/corner: 2 adjacent edges (e.g. top+right, right+bottom, bottom+left, left+top)
- T-junction: 3 edges
- Cross: all 4 edges
- Dead-end: 1 edge

For EACH of the 9 cells, list which edges the cable segment exits through.

Respond with ONLY a valid JSON object — no markdown fences, no explanation:
{
  "1x1": ["edge", ...],
  "1x2": [...],
  "1x3": [...],
  "2x1": [...],
  "2x2": [...],
  "2x3": [...],
  "3x1": [...],
  "3x2": [...],
  "3x3": [...]
}`;

export async function analyzeGrid(imageBuffer: Buffer, label = 'grid'): Promise<GridState> {
  const base64 = imageBuffer.toString('base64');
  const dataUrl = `data:image/png;base64,${base64}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0,
    max_tokens: 600,
    messages: [
      {
        role: 'system',
        content: 'You analyze electrical cable grid puzzles. Respond ONLY with valid JSON.',
      },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
          { type: 'text', text: GRID_VISION_PROMPT },
        ],
      },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? '{}';
  console.log(`[s02e02] Raw vision response (${label}):`, raw);

  const match = raw.match(/\{[\s\S]*\}/);
  const jsonStr = match ? match[0] : '{}';
  const parsed = GridStateSchema.parse(JSON.parse(jsonStr));

  const state: GridState = {};
  for (const position of GRID_POSITIONS) {
    const connections = DirectionArraySchema.parse(parsed[position] ?? []);
    state[position] = connections;
    console.log(`[s02e02] ${label} tile ${position}: [${connections.join(', ')}]`);
  }

  return state;
}

// ─── Rotation logic ───────────────────────────────────────────────────────────

const CW_MAP: Record<Direction, Direction> = {
  top: 'right',
  right: 'bottom',
  bottom: 'left',
  left: 'top',
};

export function rotateConnectionsCW(connections: Direction[]): Direction[] {
  return connections.map(d => CW_MAP[d]);
}

export function computeRotationsForTile(current: Direction[], target: Direction[]): number {
  const sortedTarget = [...target].sort().join(',');
  let rotated = [...current];

  for (let i = 0; i <= 3; i++) {
    if ([...rotated].sort().join(',') === sortedTarget) return i;
    rotated = rotateConnectionsCW(rotated);
  }

  return -1;
}

export function computeAllRotations(
  current: GridState,
  target: GridState,
  label = '',
): Record<string, number> {
  const result: Record<string, number> = {};
  const prefix = label ? `[${label}] ` : '';

  for (const position of GRID_POSITIONS) {
    const cur = current[position] ?? [];
    const tgt = target[position] ?? [];
    const count = computeRotationsForTile(cur, tgt);

    const curStr = `[${cur.sort().join(',')}]`;
    const tgtStr = `[${tgt.sort().join(',')}]`;

    if (count === -1) {
      const reason = cur.length !== tgt.length
        ? `connection count mismatch (current: ${cur.length}, target: ${tgt.length})`
        : `shape mismatch (no rotation of ${curStr} produces ${tgtStr})`;
      console.warn(`[s02e02] ${prefix}MISMATCH ${position}: current=${curStr} target=${tgtStr} — ${reason}`);
    } else {
      console.log(`[s02e02] ${prefix}tile ${position}: current=${curStr} target=${tgtStr} → rotate ${count}x`);
    }

    result[position] = count;
  }

  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function applyRotations(rotations: Record<string, number>): Promise<string | undefined> {
  for (const position of GRID_POSITIONS) {
    const count = rotations[position] ?? 0;
    if (count <= 0) continue;

    for (let i = 0; i < count; i++) {
      console.log(`[s02e02] Rotating ${position} (${i + 1}/${count})`);
      const response = await rotateTile(position);
      if (response.message?.includes('{FLG:')) {
        return response.message;
      }
    }
  }

  return undefined;
}

export async function main(): Promise<void> {
  // 1. Fetch and analyze the solved (target) image
  console.log('[s02e02] Analyzing solved image to derive target state...');
  const solvedImage = await fetchSolvedImage();
  const targetState = await analyzeGrid(solvedImage, 'target');
  console.log('[s02e02] Target state:', JSON.stringify(targetState));

  // 2. Reset the grid
  await resetGrid();

  // 3. Fetch current state image
  const gridImage = await fetchGridImage();

  // 4. Analyze current state via vision
  console.log('[s02e02] Analyzing current grid with vision...');
  const currentState = await analyzeGrid(gridImage, 'current');
  console.log('[s02e02] Current state:', JSON.stringify(currentState));

  // 5. Compute rotations
  const rotations = computeAllRotations(currentState, targetState, 'initial');
  console.log('[s02e02] Rotations needed:', JSON.stringify(rotations));

  // 6. Check for vision errors
  const errors = Object.entries(rotations).filter(([, count]) => count === -1);
  if (errors.length > 0) {
    console.warn('[s02e02] WARNING: Vision errors for tiles:', errors.map(([pos]) => pos).join(', '));
  }

  // 7. Apply rotations
  const flag = await applyRotations(rotations);
  if (flag) {
    console.log(`[s02e02] FLAG: ${flag}`);
    return;
  }

  // 8. Verify — re-fetch and check
  console.log('[s02e02] All rotations sent. Verifying...');
  const verifyImage = await fetchGridImage();
  const verifyState = await analyzeGrid(verifyImage, 'verify');
  const corrections = computeAllRotations(verifyState, targetState, 'verify');
  const needsMore = Object.values(corrections).some(c => c > 0);

  if (needsMore) {
    console.log('[s02e02] Corrections needed:', JSON.stringify(corrections));
    let correctionRound = 0;
    const MAX_CORRECTION_ROUNDS = 2;

    let pendingCorrections = corrections;
    while (Object.values(pendingCorrections).some(c => c > 0) && correctionRound < MAX_CORRECTION_ROUNDS) {
      correctionRound++;
      console.log(`[s02e02] Correction round ${correctionRound}...`);
      const correctionFlag = await applyRotations(pendingCorrections);
      if (correctionFlag) {
        console.log(`[s02e02] FLAG: ${correctionFlag}`);
        return;
      }
      const nextImage = await fetchGridImage();
      const nextState = await analyzeGrid(nextImage, `verify-${correctionRound}`);
      pendingCorrections = computeAllRotations(nextState, targetState, `verify-${correctionRound}`);
    }
  } else {
    console.log('[s02e02] Grid appears correct but no flag received.');
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
