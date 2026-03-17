# S02E02 — Electricity Grid Puzzle: Task Guide

## Task Description (Full Translation)

### Objective

You have an electrical puzzle to solve on a 3x3 board. You must deliver power to all three power plants (PWR6132PL, PWR1593PL, PWR7264PL) by connecting them appropriately with the emergency power source (located on the left at the bottom). The board represents a cable network — each cell contains an electrical connector element. Your goal is to deliver power to all power plants by rotating the appropriate cells so that the cable layout matches the given target schematic.

The only allowed operation is rotating a selected cell by 90 degrees clockwise. You can rotate as many cells as you want — but each rotation costs one API request.

**Task name:** `electricity`

### How Does the Board Look?

You fetch the current board state as a PNG image:

```
GET https://hub.ag3nts.org/data/{YOUR_API_KEY}/electricity.png
```

Cells are addressed in format `AxB`, where A is the row (1-3, from top) and B is the column (1-3, from left):

```
1x1 | 1x2 | 1x3
----|-----|----
2x1 | 2x2 | 2x3
----|-----|----
3x1 | 3x2 | 3x3
```

### What Does the Solution Look Like?

The target/solved state is shown at:

```
https://hub.ag3nts.org/i/solved_electricity.png
```

This image shows the correct cable arrangement that connects the power source to all three power plants.

### How to Communicate with the Hub?

Each request is a POST to `https://hub.ag3nts.org/verify`:

```json
{
  "apikey": "your-api-key",
  "task": "electricity",
  "answer": {
    "rotate": "2x3"
  }
}
```

**One request = one rotation of one cell.** If you want to rotate 3 cells, you send 3 separate requests.

When the board reaches the correct configuration, the hub returns a flag `{FLG:...}`.

### Resetting the Board

If you want to start from the beginning, call GET with the reset parameter:

```
GET https://hub.ag3nts.org/data/{YOUR_API_KEY}/electricity.png?reset=1
```

## Step-by-Step Instructions

1. **Read the current state** — fetch the PNG image and determine how cables are arranged on each of the 9 cells.
2. **Compare with the target state** — determine which cells differ from the target layout and how many rotations (90 degrees clockwise each) each cell needs.
3. **Send rotations** — for each cell that needs a change, send the appropriate number of requests with the `rotate` field.
4. **Check the result** — if needed, fetch the updated image and verify whether the board matches the schematic.
5. **Receive the flag** — when the configuration is correct, the hub returns `{FLG:...}`.

## Hints

1. **LLMs don't see images** — the board state is a PNG file, but the agent needs it in a form it can reason about. Consider: how can you describe the appearance of each cell using words or symbols? How can you convey this information textually to the model so it can plan rotations? You can try sending the image directly to a model with vision capabilities, but is it worth doing in the main agent loop? It's worth delegating image description to an appropriate tool or sub-agent.

2. **Vision model issues** — not all vision models will handle this task well. Test which models return the best results. Perhaps the image should be prepared before sending it to the model? Does it have to be sent as a whole? One of the better models to use is `google/gemini-3-flash-preview`.

3. **Rotation mechanics** — each rotation is 90 degrees clockwise. To rotate a cell "to the left" (90 degrees counter-clockwise), perform 3 clockwise rotations. Cables on each cell can exit through different combinations of edges (left, right, top, bottom) — rotation shifts them clockwise.

4. **Agent-based approach** — this task is particularly well-suited for solving with an agent using Function Calling. The agent can independently: read and interpret the map state, compare with the target, calculate needed rotations, and send them sequentially — without hardcoding the order in code.

5. **Verify after each batch of rotations** — after performing several rotations, you can fetch a fresh image and check if the current state matches the schematic. Errors in image interpretation can result in unnecessary rotations or the need to reset.

## API Endpoints Summary

| Endpoint | Method | Purpose |
|---|---|---|
| `https://hub.ag3nts.org/data/{API_KEY}/electricity.png` | GET | Fetch current board state as PNG |
| `https://hub.ag3nts.org/data/{API_KEY}/electricity.png?reset=1` | GET | Reset the board to initial state |
| `https://hub.ag3nts.org/i/solved_electricity.png` | GET | Fetch the target/solved state image |
| `https://hub.ag3nts.org/verify` | POST | Submit a rotation or verify solution |

## Input/Output Formats

### Rotation Request (POST body)
```json
{
  "apikey": "<AIDEVS_API_KEY>",
  "task": "electricity",
  "answer": {
    "rotate": "AxB"
  }
}
```
Where `AxB` is the cell address (e.g., `"2x3"`).

### Response
- On success (puzzle solved): `{ "code": 0, "message": "{FLG:...}" }`
- On rotation applied (not yet solved): `{ "code": 0, "message": "..." }`
- On error: `{ "code": -1, "message": "error description" }`

## Cable Connection Model

Each cell on the 3x3 grid has cable segments connecting to a subset of its four edges:
- **Top** (T)
- **Right** (R)
- **Bottom** (B)
- **Left** (L)

Common tile types:
- **Straight**: 2 opposite edges (e.g., L-R horizontal, T-B vertical)
- **L-bend**: 2 adjacent edges (e.g., T-R, R-B, B-L, L-T)
- **T-junction**: 3 edges (e.g., T-R-B, R-B-L, B-L-T, L-T-R)
- **Cross**: all 4 edges (no rotation needed)
- **Dead end**: 1 edge

A 90-degree clockwise rotation transforms connections: T->R, R->B, B->L, L->T.
