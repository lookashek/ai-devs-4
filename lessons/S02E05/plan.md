# Implementation Plan — S02E05

## 0. Pre-work: Read Agent Guidelines

- Read ALL files from the `/.ai` directory. They contain coding conventions and behavioral rules.
- Apply those guidelines throughout the entire implementation.
- Do NOT copy their contents — just read and follow them.

## 1. Check Reusable Tools

- Go to `/general` directory.
- Read the `README.md` there to understand what utilities already exist.
- Reuse:
  - `config` — validated env config with `AIDEVS_API_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`
  - `submitAnswer({ task, answer })` — submits to Hub API `/verify`
  - `openai` — pre-configured OpenAI client instance
  - `chat(messages, options)` — sends chat completions (supports model override)
  - `ask(userMessage, options)` — convenience wrapper for single user message
  - `resilientFetch(url, options)` — HTTP client with retry/backoff
- No new generic utilities should be needed for this task.

## 2. Environment Variables

- Read `.env.example` in the project root to learn available variable names.
- Required vars: `AIDEVS_API_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`
- Do NOT read or ask for `.env` — assume it exists and is populated.
- No new env vars needed.

## 3. Task Breakdown

### Step 3.1: Analyze Map with Vision Model

- Construct the map URL: `https://hub.ag3nts.org/data/${config.AIDEVS_API_KEY}/drone.png`
- Use the `openai` client directly (not `chat()`/`ask()` helpers, since they don't support image content) to send the map image URL to a vision model.
- Use model `gpt-4o` (or `gpt-5.4` if available — check `config.OPENAI_MODEL`).
- Prompt the vision model to:
  1. Count the total number of rows and columns in the grid
  2. Identify the sector containing the **dam** (look for intensified blue water color, boundary between water and land)
  3. Return the dam's position as `(row, col)` with 1-based indexing where (1,1) is the top-left
- Parse the response to extract the `(row, col)` coordinates.
- Log the identified grid size and dam position clearly.

### Step 3.2: Build Drone Instructions

Based on the drone API documentation (see `guide.md` for full reference), construct a **minimal** instruction set. The required instructions are:

```typescript
const instructions = [
  `setDestinationObject(PWR6132PL)`,  // Declare power plant as target
  `set(${col},${row})`,               // Landing sector = dam coordinates (x=col, y=row)
  `set(engineON)`,                    // Enable engines
  `set(100%)`,                        // Full engine power
  `set(50m)`,                         // Flight altitude
  `set(destroy)`,                     // Mission: destroy
  `flyToLocation`,                    // Execute flight
];
```

**IMPORTANT:** The `set(x,y)` function uses `x` = column, `y` = row (not row,col). Confirm this from the API docs.

Do NOT add unnecessary instructions (name, owner, LED, calibration, diagnostics). Keep it minimal.

### Step 3.3: Submit Instructions to Hub API

- Use `submitAnswer()` from `@ai-devs-4/general`:
  ```typescript
  const result = await submitAnswer({
    task: 'drone',
    answer: { instructions },
  });
  ```
- Check the response for `{FLG:...}` — if found, log it and exit successfully.
- If the response contains an error, log it clearly.

### Step 3.4: Implement Retry Loop Based on API Feedback

- If the API returns an error message, parse it and adjust instructions accordingly.
- Common adjustments:
  - Wrong coordinates → re-analyze map or try neighboring sectors
  - Missing required instruction → add it
  - Invalid instruction format → fix syntax
- If configuration gets tangled, send `hardReset` as a standalone instruction first, then retry.
- Maximum 5 retry attempts.

### Step 3.5: Handle Edge Cases

- If vision model gives ambiguous coordinates, try a second analysis with a more specific prompt.
- If the first attempt fails, consider asking the vision model again with the error feedback for context.
- Always log the full API response for debugging.

## 4. Expected Solution Shape

- Main file location: `lessons/S02E05/index.ts`
- The script must be runnable end-to-end with: `npx tsx lessons/S02E05/index.ts`
- Flow: analyze map (vision) → build instructions → submit → iterate on errors → print flag
- Uses tools from `@ai-devs-4/general` (config, submitAnswer, openai)
- Handles errors and logs meaningful messages with `[drone]` prefix
- Exports `TASK = 'drone'` and `main()` function
- Guards main execution with `isMain` check

## 5. Acceptance Criteria

- [ ] Script runs without errors
- [ ] Vision model correctly identifies the dam sector on the map
- [ ] Minimal instruction set is sent (no unnecessary configuration)
- [ ] API errors are parsed and instructions adjusted iteratively
- [ ] Flag `{FLG:...}` is captured and logged
- [ ] No hardcoded secrets or API keys
- [ ] Reusable utilities from `@ai-devs-4/general` are used
- [ ] Code follows project conventions (strict TypeScript, Zod validation, structured logging)
