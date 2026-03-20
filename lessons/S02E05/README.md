# S02E05 — Drone Strike

## Task

Program an armed drone (DRN-BMB7) to bomb a dam near the Zarnowiec power plant. The drone must be declared as targeting the power plant (`PWR6132PL`), but the actual landing coordinates must point to the dam sector on the terrain map grid.

## Approach

1. Analyze the terrain map image using a vision model (GPT-4o) to locate the dam sector
2. Build a minimal drone instruction set with the dam's grid coordinates
3. Submit instructions to the Hub API (`task: "drone"`)
4. Iterate based on API error feedback if needed

## Result

Flag: pending

## Reusable Patterns

- Vision model image analysis via OpenAI `chat.completions.create()` with `image_url` content
