# S02E02 — Electricity Grid Puzzle

## Task

Solve a 3×3 electrical grid puzzle by rotating cable tiles so that power flows from the emergency source to all three power plants. The current board state is fetched as a PNG; each rotation is submitted via the Hub API. When the board matches the target schematic, the hub returns a flag.

## Approach

1. **Reset** the grid to a known initial state (`GET /electricity.png?reset=1`).
2. **Fetch** the current board state as a PNG.
3. **Crop** the image into 9 individual tile images using `sharp` (3×3 equal division).
4. **Analyze** each tile via GPT-4o vision to determine which edges the cable connects to.
5. **Compute** the minimum clockwise rotations needed for each tile to match the hardcoded `TARGET_STATE`.
6. **Send** the computed rotations sequentially via `POST /verify` with `{ rotate: "AxB" }`.
7. **Verify** by re-fetching and re-analyzing; apply corrections if needed (max 2 rounds).

## Target State

The solved configuration is defined as `TARGET_STATE` in `index.ts`, derived from visual inspection of `https://hub.ag3nts.org/i/solved_electricity.png`.

## Result

Flag: pending

## Dependencies

- `sharp` — image cropping of the grid PNG into individual tiles
- `@ai-devs-4/general` — `config`, `openai`, `submitAnswer`, `resilientFetch`
- `zod` — validation of GPT-4o vision responses
