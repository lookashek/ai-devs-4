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

// ─── Target (solved) state ────────────────────────────────────────────────────
// Derived from visual inspection of https://hub.ag3nts.org/i/solved_electricity.png
// Row 1: top row, Row 2: middle row, Row 3: bottom row
// Columns 1-3 left to right

export const TARGET_STATE: GridState = {
  '1x1': ['right', 'bottom'],         // L-bend: right + bottom
  '1x2': ['left', 'right', 'bottom'], // T-junction: left + right + bottom
  '1x3': ['left', 'bottom'],          // L-bend: left + bottom
  '2x1': ['top', 'right', 'bottom'],  // T-junction: top + right + bottom
  '2x2': ['top', 'left'],             // L-bend: top + left
  '2x3': ['top', 'right', 'bottom'],  // T-junction: top + right + bottom
  '3x1': ['top', 'right'],            // L-bend: top + right
  '3x2': ['left', 'right'],           // Straight horizontal
  '3x3': ['top', 'left'],             // L-bend: top + left
};

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

// ─── Image processing ─────────────────────────────────────────────────────────

export async function cropTiles(imageBuffer: Buffer): Promise<Map<string, Buffer>> {
  const metadata = await sharp(imageBuffer).metadata();
  const { width = 0, height = 0 } = metadata;

  // The grid is a 3x3 tile region. Heuristic: assume equal division of image.
  // The image typically has a thin border — divide into 3 equal cells each axis.
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

export async function analyzeTile(tileBuffer: Buffer, position: string): Promise<Direction[]> {
  const base64 = tileBuffer.toString('base64');
  const dataUrl = `data:image/png;base64,${base64}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0,
    max_tokens: 100,
    messages: [
      {
        role: 'system',
        content: 'You analyze electrical cable tiles. Each tile is a square with cable segments connecting to edges. Respond ONLY with a JSON array.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: dataUrl, detail: 'high' },
          },
          {
            type: 'text',
            text: `This is a single tile from a 3x3 electrical grid at position ${position}.
The tile has thick dark cable lines on a light background.
Which edges of this tile do the cables connect to?
Possible edges: top, right, bottom, left.
Respond with ONLY a JSON array of connected edges, e.g.: ["top", "right"]`,
          },
        ],
      },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? '[]';
  const match = raw.match(/\[.*?\]/s);
  const jsonStr = match ? match[0] : '[]';
  const parsed = DirectionArraySchema.parse(JSON.parse(jsonStr));

  console.log(`[s02e02] Tile ${position}: [${parsed.join(', ')}]`);
  return parsed;
}

export async function analyzeGrid(imageBuffer: Buffer): Promise<GridState> {
  const tiles = await cropTiles(imageBuffer);
  const state: GridState = {};

  for (const position of GRID_POSITIONS) {
    const tileBuffer = tiles.get(position);
    if (!tileBuffer) throw new Error(`[s02e02] Missing tile buffer for ${position}`);
    state[position] = await analyzeTile(tileBuffer, position);
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
): Record<string, number> {
  const result: Record<string, number> = {};

  for (const position of GRID_POSITIONS) {
    const cur = current[position] ?? [];
    const tgt = target[position] ?? [];
    const count = computeRotationsForTile(cur, tgt);

    if (count === -1) {
      console.warn(`[s02e02] WARNING: Vision error for tile ${position} — no matching rotation found`);
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
  // 1. Reset the grid
  await resetGrid();

  // 2. Fetch current state image
  const gridImage = await fetchGridImage();

  // 3. Analyze current state via vision
  console.log('[s02e02] Analyzing grid with vision...');
  const currentState = await analyzeGrid(gridImage);
  console.log('[s02e02] Current state:', JSON.stringify(currentState));

  // 4. Compute rotations
  const rotations = computeAllRotations(currentState, TARGET_STATE);
  console.log('[s02e02] Rotations needed:', JSON.stringify(rotations));

  // 5. Check for vision errors
  const errors = Object.entries(rotations).filter(([, count]) => count === -1);
  if (errors.length > 0) {
    console.warn('[s02e02] WARNING: Vision errors for tiles:', errors.map(([pos]) => pos).join(', '));
  }

  // 6. Apply rotations
  const flag = await applyRotations(rotations);
  if (flag) {
    console.log(`[s02e02] FLAG: ${flag}`);
    return;
  }

  // 7. Verify — re-fetch and check
  console.log('[s02e02] All rotations sent. Verifying...');
  const verifyImage = await fetchGridImage();
  const verifyState = await analyzeGrid(verifyImage);
  const corrections = computeAllRotations(verifyState, TARGET_STATE);
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
      const nextState = await analyzeGrid(nextImage);
      pendingCorrections = computeAllRotations(nextState, TARGET_STATE);
    }
  } else {
    console.log('[s02e02] Grid appears correct but no flag received. Verify TARGET_STATE.');
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
