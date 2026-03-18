# Implementation Plan — S02E03

## 0. Pre-work: Read Agent Guidelines

- Read ALL files from the `/.ai` directory. They contain coding conventions and behavioral rules.
- Apply those guidelines throughout the entire implementation.
- Do NOT copy their contents — just read and follow them.

## 1. Check Reusable Tools

- Go to `/general` directory.
- Read the `README.md` there to understand what utilities already exist.
- Reuse:
  - `config` — for `AIDEVS_API_KEY` and other env vars (never use raw `process.env`).
  - `submitAnswer` — for posting answers to Hub API.
  - `resilientFetch` — for downloading the log file with retry logic.
  - `ask` / `chat` — for LLM-based compression of log entries if needed.
- If a token-counting utility does not exist, implement one in `/general` (see Step 3.5).

## 2. Environment Variables

- Read `.env.example` in the project root to learn available variable names.
- Required variables: `AIDEVS_API_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`.
- No new env vars are needed for this task.
- In code, always load config via `config` from `@ai-devs-4/general`.

## 3. Task Breakdown

### Step 3.1: Download the Log File

- Use `resilientFetch` to GET `https://hub.ag3nts.org/data/${config.AIDEVS_API_KEY}/failure.log`.
- Read the response as text.
- Log the total number of lines and approximate size.
- Store the raw text in a variable (do NOT send entire file to LLM).

### Step 3.2: Mechanical Filtering (Stage 1)

- Split the log text into lines.
- Filter lines that match severity levels: `CRIT`, `ERRO`, `WARN` (case-insensitive check or exact match based on log format).
- Discard all `INFO`, `DEBUG`, and other low-severity lines.
- Log how many lines remain after this filter and estimate their token count.

### Step 3.3: Keyword Filtering (Stage 1b)

- From the WARN/ERRO/CRIT lines, optionally also check for power-plant-relevant keywords: `coolant`, `pump`, `power`, `reactor`, `temp`, `pressure`, `cooling`, `water`, `generator`, `turbine`, `valve`, `trip`, `shutdown`, `overload`, `voltage`, `frequency`.
- If the filtered set is still too large (estimated > 1500 tokens), remove lines that appear to be noise (e.g., repeated heartbeat warnings, retry messages, debug-related warnings).
- Log the count and estimated token size of the remaining lines.

### Step 3.4: Estimate Token Count

- Before any LLM call, estimate tokens conservatively: `Math.ceil(text.length / 3.5)` as a rough approximation (GPT tokenizer averages ~4 chars/token, but be conservative).
- If the filtered lines already fit within ~1500 tokens, proceed directly to formatting (skip LLM compression).
- If they exceed ~1500 tokens, proceed to Step 3.5 for LLM-based compression.

### Step 3.5: LLM-Based Compression (if needed)

- If the filtered events exceed 1500 tokens, use the `ask` or `chat` function from `@ai-devs-4/general` to compress them.
- Send the filtered log lines to the LLM with a system prompt like:

  ```
  You are a power plant log analyst. Compress the following log entries into a condensed format that fits within 1500 tokens. Rules:
  - One line per event
  - Preserve: timestamp (YYYY-MM-DD HH:MM), severity level ([CRIT]/[WARN]/[ERRO]), subsystem ID
  - Shorten descriptions to essential meaning
  - Group repeated similar events — keep only the first occurrence and the most severe
  - Remove redundant information
  - Prioritize CRIT events, then ERRO, then WARN
  - Cover all subsystems: power, cooling, pumps, reactor, software, generators, turbines
  ```

- Use a cost-effective model (e.g., `gpt-4o-mini`) if possible to reduce API costs.
- Validate the output: ensure each line has timestamp, level, and component ID.
- Re-estimate token count of the compressed output.

### Step 3.6: Token Count Verification

- Before submitting, count tokens of the final `logs` string.
- Use the conservative estimate: `Math.ceil(text.length / 3.5)`.
- If over ~1400 tokens (leaving margin), trim further: remove least-critical WARN entries or shorten descriptions more aggressively.
- Log the final token estimate.

### Step 3.7: Format and Submit

- Join all condensed log lines with `\n` into a single string.
- Use `submitAnswer` from `@ai-devs-4/general` with:
  ```typescript
  await submitAnswer({
    task: 'failure',
    answer: { logs: condensedLogsString },
  });
  ```
- Log the full Hub API response.

### Step 3.8: Parse Feedback and Iterate

- If the Hub response does NOT contain `{FLG:...}`, parse the feedback message.
- The feedback will specify which subsystems are missing or insufficiently described.
- Go back to the filtered lines from Step 3.2/3.3 and find entries related to the missing subsystems.
- Add those entries to the condensed logs, re-compress if needed to stay within 1500 tokens.
- Re-submit (repeat Steps 3.6–3.8).
- Implement this as a loop with a maximum of 5 iterations to avoid infinite retries.
- Log each iteration: what feedback was received, what was added, new token count.

### Step 3.9: Output the Flag

- When the Hub response contains `{FLG:...}`, log it clearly.
- Print the flag as the final output.

## 4. Expected Solution Shape

- Main file location: `lessons/S02E03/index.ts`
- The script must be runnable end-to-end with: `npx tsx lessons/S02E03/index.ts`
- Flow: download log → filter → compress → count tokens → submit → parse feedback → iterate → print flag.
- Create `lessons/S02E03/package.json` and `lessons/S02E03/tsconfig.json` per the conventions in `.ai/lessons.md`.
- Create backend router `backend/src/lessons/s02e03.ts` and frontend registration `frontend/src/lessons/S02E03.ts` per conventions.
- All business logic must be in exported functions in `index.ts`; the backend router only imports and orchestrates.
- Update `lessons/S02E03/README.md` with task description, approach, and flag once obtained.

## 5. Acceptance Criteria

- [ ] Script runs without errors via `npx tsx lessons/S02E03/index.ts`
- [ ] Log file is downloaded successfully from Hub API
- [ ] Mechanical filtering reduces log to WARN/ERRO/CRIT entries
- [ ] Final condensed logs fit within 1500 tokens (verified before submission)
- [ ] Each log line contains: timestamp (YYYY-MM-DD HH:MM), severity level, subsystem ID
- [ ] Answer submitted to Hub API as `{ task: "failure", answer: { logs: "..." } }`
- [ ] Feedback loop implemented: parse Hub response, add missing subsystems, resubmit
- [ ] Flag `{FLG:...}` received and printed
- [ ] No hardcoded secrets or API keys
- [ ] Reusable utilities used from `@ai-devs-4/general`
- [ ] Backend router and frontend registration created per conventions
- [ ] `lessons/S02E03/README.md` updated with approach and flag
