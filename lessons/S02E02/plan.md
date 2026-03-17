# Implementation Plan — S02E02

## 0. Pre-work: Read Agent Guidelines

- Read ALL files from the `/.ai` directory. They contain coding conventions and behavioral rules.
- Apply those guidelines throughout the entire implementation.
- Do NOT copy their contents — just read and follow them.

## 1. Check Reusable Tools

- Go to `/general` directory.
- Read the `README.md` there to understand what utilities already exist.
- **Reuse these existing modules:**
  - `config` — for `AIDEVS_API_KEY`, `OPENAI_API_KEY`, and other env vars
  - `resilientFetch` — for all HTTP requests (handles 503/429 retries automatically)
  - `openai` — raw OpenAI client instance, needed for GPT-4o vision API calls
  - `submitAnswer` — **NOTE:** This submits to `/verify` but with `{ task, answer }` shape. For this task, `answer` is `{ rotate: "AxB" }`, so `submitAnswer` can be used directly.
- **New dependency needed:** `sharp` (npm package) for cropping the grid PNG into individual tile images. Add to the lesson's `package.json` only — this is task-specific, not a `/general` utility.

## 2. Environment Variables

- Read `.env.example` in the project root to learn available variable names.
- Do NOT read or ask for `.env` — you have no access to it. Assume it exists and is populated.
- **No new environment variables needed.** This task uses only:
  - `AIDEVS_API_KEY` (for hub API authentication and image URL)
  - `OPENAI_API_KEY` (for GPT-4o vision calls)
- In code, always load config via `import { config } from '@ai-devs-4/general'`.

## 3. Task Breakdown

See `guide.md` in this directory for the full task description, all API endpoints, and formats.

### Step 3.1: Create Project Scaffold

Create these files in `lessons/S02E02/`:

**`package.json`:**
```json
{
  "name": "@ai-devs-4/s02e02",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./index.ts",
  "scripts": {
    "start": "tsx index.ts"
  },
  "dependencies": {
    "@ai-devs-4/general": "*",
    "sharp": "^0.33.0",
    "zod": "^3.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.5.0"
  }
}
```

**`tsconfig.json`:** Copy from any existing lesson (e.g., `S01E01/tsconfig.json`). Strict mode, ES2022, ESNext modules.

Run `npm install` from the monorepo root after creating these files.

### Step 3.2: Define Types and Constants

In `index.ts`, define:

- `TASK = 'electricity'` constant
- `Direction` type: `'top' | 'right' | 'bottom' | 'left'`
- `TileState` type: `Direction[]` (array of edges a cable connects to)
- `GridState` type: `Record<string, TileState>` (maps `"AxB"` -> connections)
- `GRID_POSITIONS`: `["1x1", "1x2", "1x3", "2x1", "2x2", "2x3", "3x1", "3x2", "3x3"]`
- URL constants built from `config.AIDEVS_API_KEY`:
  - `GRID_IMAGE_URL` = `https://hub.ag3nts.org/data/${config.AIDEVS_API_KEY}/electricity.png`
  - `RESET_URL` = `${GRID_IMAGE_URL}?reset=1`
  - `SOLVED_IMAGE_URL` = `https://hub.ag3nts.org/i/solved_electricity.png`

### Step 3.3: Hardcode the Target (Solved) State

The solved state image is static. Analyze it visually (fetch and view the PNG at `https://hub.ag3nts.org/i/solved_electricity.png`) and hardcode a `TARGET_STATE: GridState` mapping.

For each of the 9 cells, determine which edges (top, right, bottom, left) the cable connects to in the solved image. Store as:

```typescript
const TARGET_STATE: GridState = {
  '1x1': ['right', 'bottom'],       // L-bend
  '1x2': ['left', 'right', 'bottom'], // T-junction
  '1x3': ['left', 'bottom'],        // L-bend
  '2x1': ['top', 'right', 'bottom'], // T-junction
  '2x2': ['top', 'left'],           // L-bend
  '2x3': ['top', 'right', 'bottom'], // T-junction
  '3x1': ['top', 'right'],          // L-bend
  '3x2': ['left', 'right'],         // Straight horizontal
  '3x3': ['top', 'left'],           // L-bend
};
```

**IMPORTANT:** These values are approximate from visual inspection. The implementing agent MUST verify by looking at the solved image themselves. Use GPT-4o vision on the solved image to confirm, or manually inspect the downloaded PNG. Adjust if different.

### Step 3.4: Implement API Helper Functions

**`resetGrid(): Promise<Buffer>`**
- GET request to `RESET_URL` using `resilientFetch`
- Returns the response as a PNG `Buffer`
- Log: `[s02e02] Grid reset`

**`fetchGridImage(): Promise<Buffer>`**
- GET request to `GRID_IMAGE_URL` using `resilientFetch`
- Returns the PNG as a `Buffer`
- Log: `[s02e02] Fetched current grid image`

**`rotateTile(position: string): Promise<HubResponse>`**
- Use `submitAnswer({ task: TASK, answer: { rotate: position } })`
- Log: `[s02e02] Rotated tile ${position}`
- Return the hub response (check if it contains `{FLG:` for the flag)

### Step 3.5: Implement Image Cropping

**`cropTiles(imageBuffer: Buffer): Promise<Map<string, Buffer>>`**

Use `sharp` to:
1. Get image metadata (width, height) via `sharp(imageBuffer).metadata()`
2. The image contains a 3x3 grid area. Determine the grid boundaries:
   - The grid is the main content area of the image (may have labels/borders around it)
   - Use heuristics or manual measurement to find the grid's pixel region
   - A reasonable first approach: analyze the image dimensions and assume the grid occupies a known portion
3. Divide the grid region into 9 equal rectangles (3 rows x 3 columns)
4. For each cell, extract the tile using `sharp(imageBuffer).extract({ left, top, width, height }).toBuffer()`
5. Return a `Map<string, Buffer>` mapping position strings (`"1x1"` through `"3x3"`) to tile image buffers

**Tip:** If the exact grid boundaries are hard to determine programmatically, an alternative approach is to send the full image to GPT-4o vision with a prompt asking it to describe all 9 cells at once. Cropping individual tiles is preferred for accuracy but the full-image approach is a valid fallback.

### Step 3.6: Implement Vision-Based Tile Analysis

**`analyzeTile(tileBuffer: Buffer, position: string): Promise<Direction[]>`**

1. Convert the tile image buffer to a base64 data URL: `data:image/png;base64,${tileBuffer.toString('base64')}`
2. Call `openai.chat.completions.create` with:
   - `model: 'gpt-4o'`
   - `temperature: 0`
   - `max_tokens: 100`
   - Messages containing:
     - System: "You analyze electrical cable tiles. Each tile is a square with cable segments connecting to edges."
     - User: array with image_url content part + text prompt:
       ```
       This is a single tile from a 3x3 electrical grid at position {position}.
       The tile has thick black cable lines on a light background.
       Which edges of this tile do the cables connect to?
       Possible edges: top, right, bottom, left.
       Respond with ONLY a JSON array of connected edges, e.g.: ["top", "right"]
       ```
3. Parse the response text, extract the JSON array
4. Validate with Zod: `z.array(z.enum(['top', 'right', 'bottom', 'left']))`
5. Return the validated array
6. Log: `[s02e02] Tile ${position}: [${connections.join(', ')}]`

**`analyzeGrid(imageBuffer: Buffer): Promise<GridState>`**

1. Call `cropTiles(imageBuffer)` to get 9 tile buffers
2. For each tile, call `analyzeTile(tileBuffer, position)`
3. Collect results into a `GridState` record
4. Return the full grid state

**Alternative approach (fallback):** If cropping is problematic, send the entire grid image to GPT-4o with a prompt asking it to describe all 9 tiles' connections in a structured JSON format. This is less accurate but simpler.

### Step 3.7: Implement Rotation Calculation

**`rotateConnectionsCW(connections: Direction[]): Direction[]`**
- Map each direction clockwise: `top -> right`, `right -> bottom`, `bottom -> left`, `left -> top`
- Return the transformed array

**`computeRotationsForTile(current: Direction[], target: Direction[]): number`**
- Sort both arrays for comparison
- Try 0, 1, 2, 3 clockwise rotations of `current`
- For each rotation count, apply `rotateConnectionsCW` that many times and check if the result matches `target` (same elements when sorted)
- Return the rotation count (0-3)
- If no match found after 3 rotations, return -1 (indicates vision error — tile types don't match)

**`computeAllRotations(current: GridState, target: GridState): Record<string, number>`**
- For each of the 9 positions, call `computeRotationsForTile`
- Return the map of position -> rotation count
- Log any positions where rotation = -1 as warnings

### Step 3.8: Implement Main Execution Flow

```
async function main(): Promise<void> {
  // 1. Reset the grid
  log '[s02e02] Resetting grid...'
  await resetGrid()

  // 2. Fetch current state image
  log '[s02e02] Fetching current grid...'
  const gridImage = await fetchGridImage()

  // 3. Analyze current state via vision
  log '[s02e02] Analyzing grid with vision...'
  const currentState = await analyzeGrid(gridImage)
  log '[s02e02] Current state:', JSON.stringify(currentState)

  // 4. Compute rotations
  const rotations = computeAllRotations(currentState, TARGET_STATE)
  log '[s02e02] Rotations needed:', JSON.stringify(rotations)

  // 5. Check for vision errors (any -1 values)
  const errors = Object.entries(rotations).filter(([_, count]) => count === -1)
  if (errors.length > 0) {
    log '[s02e02] WARNING: Vision errors for tiles:', errors.map(([pos]) => pos)
    // Could retry analysis for those tiles, or proceed with 0 rotations
  }

  // 6. Apply rotations sequentially
  for (const [position, count] of Object.entries(rotations)) {
    if (count <= 0) continue
    for (let i = 0; i < count; i++) {
      log `[s02e02] Rotating ${position} (${i + 1}/${count})`
      const response = await rotateTile(position)
      // Check for flag
      if (response.message?.includes('{FLG:')) {
        log `[s02e02] FLAG: ${response.message}`
        return
      }
    }
  }

  // 7. Verify — re-fetch and check
  log '[s02e02] All rotations sent. Verifying...'
  const verifyImage = await fetchGridImage()
  const verifyState = await analyzeGrid(verifyImage)
  const corrections = computeAllRotations(verifyState, TARGET_STATE)
  const needsMore = Object.values(corrections).some(c => c > 0)

  if (needsMore) {
    log '[s02e02] Corrections needed:', JSON.stringify(corrections)
    // Apply corrections (repeat step 6 logic)
    // Max 2 correction rounds to avoid infinite loops
  } else {
    log '[s02e02] Grid appears correct but no flag received. Check target state.'
  }
}
```

Add the standard entry point guard:
```typescript
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch(err => {
    console.error('[s02e02] Fatal error:', err);
    process.exit(1);
  });
}
```

### Step 3.9: Create README.md

Create `lessons/S02E02/README.md` with:
- Task: Solve 3x3 electrical grid puzzle by rotating cable tiles
- Approach: Vision analysis + computed rotations
- Result: (pending — fill in after getting the flag)

## 4. Expected Solution Shape

- **Main file:** `lessons/S02E02/index.ts`
- **Run command:** `npm start` (from `lessons/S02E02/`) or `npx tsx lessons/S02E02/index.ts` from root
- **Flow:** Reset grid -> Fetch PNG -> Analyze with vision -> Compute rotations -> Send rotations -> Verify -> Get flag
- **Dependencies:** `@ai-devs-4/general` (config, resilientFetch, openai, submitAnswer), `sharp`, `zod`
- **All core functions exported** for backend router reuse

## 5. Acceptance Criteria

- [ ] Script runs end-to-end with `npm start` without errors
- [ ] Grid image is fetched and analyzed correctly
- [ ] Vision correctly identifies cable connections for each tile
- [ ] Rotation calculations are correct (0-3 per tile)
- [ ] Rotations are sent via POST to the hub API
- [ ] Flag `{FLG:...}` is received and printed
- [ ] No hardcoded secrets or API keys (all via `config`)
- [ ] `sharp` used for image preprocessing
- [ ] Structured logging with `[s02e02]` prefix
- [ ] Error handling for vision failures and API errors
- [ ] README.md created with task description and approach
