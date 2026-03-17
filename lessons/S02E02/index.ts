import { fileURLToPath } from 'url';
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

const BASE_URL = `https://hub.ag3nts.org/data/${config.AIDEVS_API_KEY}/electricity`;
const GRID_JSON_URL = `${BASE_URL}.json`;
const RESET_JSON_URL = `${GRID_JSON_URL}?reset=1`;
const SOLVED_IMAGE_URL = 'https://hub.ag3nts.org/i/solved_electricity.png';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Direction = 'top' | 'right' | 'bottom' | 'left';
export type TileState = Direction[];
export type GridState = Record<string, TileState>;

const DirectionArraySchema = z.array(z.enum(['top', 'right', 'bottom', 'left']));
const GridStateSchema = z.record(z.string(), DirectionArraySchema);

// ─── API helpers ──────────────────────────────────────────────────────────────

export async function resetGrid(): Promise<unknown> {
  console.log('[s02e02] Resetting grid...');
  const res = await resilientFetch(RESET_JSON_URL, { method: 'GET' });
  const data: unknown = await res.json();
  console.log('[s02e02] Reset response:', JSON.stringify(data));
  return data;
}

export async function fetchGridJson(): Promise<unknown> {
  console.log('[s02e02] Fetching grid JSON...');
  const res = await resilientFetch(GRID_JSON_URL, { method: 'GET' });
  const data: unknown = await res.json();
  console.log('[s02e02] Raw grid JSON:', JSON.stringify(data, null, 2));
  return data;
}

export async function fetchSolvedImage(): Promise<Buffer> {
  console.log('[s02e02] Fetching solved (target) image...');
  const res = await resilientFetch(SOLVED_IMAGE_URL, { method: 'GET' });
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function rotateTile(position: string): Promise<HubResponse> {
  console.log(`[s02e02] Rotating tile ${position}`);
  return submitAnswer({ task: TASK, answer: { rotate: position } });
}

// ─── JSON analysis ─────────────────────────────────────────────────────────
// The electricity.json file encodes the current tile state. We send the raw
// JSON to GPT-4o text (no vision) and ask it to decode which edges each tile
// connects to in its current rotation.

const JSON_ANALYSIS_PROMPT = `You are analyzing an electrical cable grid puzzle from JSON data.

The puzzle is a 3x3 grid. Positions use row×column notation:
- Row 1 (top):    1x1, 1x2, 1x3
- Row 2 (middle): 2x1, 2x2, 2x3
- Row 3 (bottom): 3x1, 3x2, 3x3

Each tile has a cable piece that connects some edges: top, right, bottom, left.
Common shapes:
- Dead-end: 1 edge
- Straight: 2 opposite edges (top+bottom  OR  left+right)
- L-bend:   2 adjacent edges (top+right, right+bottom, bottom+left, left+top)
- T-junction: 3 edges
- Cross:    all 4 edges

Based on the JSON data, determine which edges each tile currently connects to.

Respond with ONLY a valid JSON object (no markdown fences, no explanation):
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
}

Grid JSON data:
`;

export async function analyzeGridJson(rawData: unknown, label = 'json'): Promise<GridState> {
  const dataStr = JSON.stringify(rawData, null, 2);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0,
    max_tokens: 600,
    messages: [
      {
        role: 'system',
        content: 'You analyze electrical cable grid puzzles from JSON. Respond ONLY with valid JSON.',
      },
      {
        role: 'user',
        content: JSON_ANALYSIS_PROMPT + dataStr,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? '{}';
  console.log(`[s02e02] LLM analysis response (${label}):`, raw);

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

// ─── Vision analysis (used for solved/target image only) ─────────────────────

const GRID_VISION_PROMPT = `This is a 3x3 electrical cable grid puzzle (the SOLVED state).

Grid positions:
- Row 1 (top):    1x1, 1x2, 1x3
- Row 2 (middle): 2x1, 2x2, 2x3
- Row 3 (bottom): 3x1, 3x2, 3x3

Each tile connects some edges: top, right, bottom, left.
Common shapes: Dead-end (1), L-bend (2 adjacent), Straight (2 opposite), T-junction (3), Cross (4).

For each of the 9 tiles list which edges the cable exits through.

Respond with ONLY a valid JSON object (no markdown fences):
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

export async function analyzeGridImage(imageBuffer: Buffer, label = 'image'): Promise<GridState> {
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
  console.log(`[s02e02] Vision response (${label}):`, raw);

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

    const curStr = `[${[...cur].sort().join(',')}]`;
    const tgtStr = `[${[...tgt].sort().join(',')}]`;

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
  // 1. Derive target state from solved image (vision, one-time)
  console.log('[s02e02] Deriving target state from solved image...');
  const solvedImage = await fetchSolvedImage();
  const targetState = await analyzeGridImage(solvedImage, 'target');
  console.log('[s02e02] Target state:', JSON.stringify(targetState));

  // 2. Reset grid
  await resetGrid();

  // 3. Fetch and analyze current state from JSON
  console.log('[s02e02] Fetching current state from JSON...');
  const gridJson = await fetchGridJson();
  const currentState = await analyzeGridJson(gridJson, 'current');
  console.log('[s02e02] Current state:', JSON.stringify(currentState));

  // 4. Compute rotations
  const rotations = computeAllRotations(currentState, targetState, 'initial');
  console.log('[s02e02] Rotations needed:', JSON.stringify(rotations));

  const errors = Object.entries(rotations).filter(([, c]) => c === -1);
  if (errors.length > 0) {
    console.warn('[s02e02] Vision/parse errors on tiles:', errors.map(([p]) => p).join(', '));
  }

  // 5. Apply rotations
  const flag = await applyRotations(rotations);
  if (flag) {
    console.log(`[s02e02] FLAG: ${flag}`);
    return;
  }

  // 6. Verify via JSON re-fetch
  console.log('[s02e02] All rotations sent. Verifying via JSON...');
  const verifyJson = await fetchGridJson();
  const verifyState = await analyzeGridJson(verifyJson, 'verify');
  const corrections = computeAllRotations(verifyState, targetState, 'verify');

  if (Object.values(corrections).some(c => c > 0)) {
    console.log('[s02e02] Corrections needed:', JSON.stringify(corrections));
    const correctionFlag = await applyRotations(corrections);
    if (correctionFlag) {
      console.log(`[s02e02] FLAG: ${correctionFlag}`);
      return;
    }
  }

  console.log('[s02e02] Done. No flag received — check target state vs actual solved state.');
}

// Guard: only run when executed directly
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch(err => {
    console.error('[s02e02] Fatal error:', err);
    process.exit(1);
  });
}
