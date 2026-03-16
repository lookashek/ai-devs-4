# S01E05 — Activate Railway Route X-01 (`railway`)

## Context

Task: Activate a railway route named **X-01** using a self-documenting API. The API has no external documentation — it describes itself via the `help` action. Communication happens via `POST https://hub.ag3nts.org/verify`. The API deliberately returns **503 errors** (simulated overload) and enforces **strict rate limits**. Patience and retry logic are essential.

---

## Pre-Implementation

**Before writing any code, read these files:**
- `/.ai/README.md`
- `/.ai/conventions.md`
- `/.ai/lessons.md`
- `/.ai/front-end-rules.md`
- `/general/README.md`

Check whether any reusable utilities already exist in `/general` that can be leveraged (e.g., `config.ts` for env vars, `hub-api.ts` for task submission, `openai-client.ts` for LLM calls). Reuse them. If a new generic utility is needed, create it in `/general/src/` and update `/general/README.md`.

---

## Implementation Steps

### 1. Create a reusable resilient HTTP client in `/general`

The existing `hub-api.ts` does not handle 503 errors or rate limits. Before starting the lesson, create a new reusable module that wraps fetch with retry and rate-limit awareness.

#### 1a. Create `general/src/resilient-fetch.ts` — Resilient HTTP Client

A generic utility for making HTTP requests with automatic retry on transient errors and rate-limit compliance. It should:

- Export a `resilientFetch(url: string, options: RequestInit, retryOptions?: RetryOptions): Promise<Response>` function that:
  1. Makes an HTTP request using native `fetch`
  2. On **503** responses: waits with exponential backoff and retries (default max 10 retries, starting at 2s delay, doubling each time, capped at 60s)
  3. On **429** responses: reads `Retry-After` header (or similar) and waits the specified time before retrying
  4. After every response, checks rate-limit headers (e.g., `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `RateLimit-Remaining`, `RateLimit-Reset`) — if remaining requests are 0, sleeps until the reset time before returning
  5. Logs every request attempt, response status, and wait times with a `[resilient-fetch]` prefix
  6. Returns the successful `Response` object
- Export a `RetryOptions` interface:
  ```typescript
  interface RetryOptions {
    maxRetries?: number;       // default: 10
    initialDelayMs?: number;   // default: 2000
    maxDelayMs?: number;       // default: 60000
    retryOnStatus?: number[];  // default: [503, 429]
  }
  ```
- Handle all rate-limit header variations (check both `X-RateLimit-*` and `RateLimit-*` prefixes)
- Log rate-limit info after each response: remaining requests, reset time, time until reset

#### 1b. Export and document the module

1. Add export for the new module in `general/src/index.ts`
2. Update `general/README.md` with a documentation section (description, exports, usage example) — follow the existing format

#### 1c. Run `npm install` from the project root to ensure everything links correctly.

---

### 2. Create lesson directory structure for S01E05

Create these files following the templates in `/.ai/lessons.md`:

- `lessons/S01E05/README.md` — task description and approach
- `lessons/S01E05/package.json` — workspace package (`@ai-devs-4/s01e05`)
- `lessons/S01E05/tsconfig.json` — standalone tsconfig (do NOT extend root — see `/.ai/lessons.md`)
- `lessons/S01E05/index.ts` — main solution script

Run `npm install` from the project root after creating the `package.json` to link the workspace.

---

### 3. Implement the Railway API client in `lessons/S01E05/index.ts`

The script must communicate with the self-documenting Railway API. All requests go to `POST https://hub.ag3nts.org/verify` with this body shape:

```json
{
  "apikey": "<AIDEVS_API_KEY>",
  "task": "railway",
  "answer": { "action": "<action-name>", ...other_params }
}
```

#### 3a. Create a helper function for Railway API calls

```typescript
async function callRailwayApi(answer: Record<string, unknown>): Promise<RailwayResponse> {
  // Uses resilientFetch to POST to https://hub.ag3nts.org/verify
  // Body: { apikey: config.AIDEVS_API_KEY, task: 'railway', answer }
  // Parses response as JSON
  // Logs the full request and response
  // Returns parsed response
}
```

This function must:
- Use the `resilientFetch` utility from `/general` to handle 503s and rate limits automatically
- Parse and log the JSON response body
- Parse and log ALL response headers (especially rate-limit headers) after every call
- Wait if rate limits indicate no remaining requests

#### 3b. Step 1 — Call `help` action

Send `{ "action": "help" }` as the answer. Read the response carefully. The response will describe:
- All available actions
- Required parameters for each action
- The correct sequence of actions to activate a route

**Log the entire help response.** This is the API's self-documentation and the roadmap for the rest of the task.

#### 3c. Step 2 — Follow the documented action sequence

Based on the `help` response, execute the actions **in the exact order specified by the API**. The typical flow is likely something like:
1. `help` → get documentation
2. Some status/query action → get route details
3. Some activation/enable action → activate the route

**CRITICAL RULES:**
- Use **exactly** the action names and parameter names from the help response — do not guess or improvise
- Use **exactly** the route name `X-01` (or whatever format the API specifies)
- After each action, log the full response and check for:
  - Error messages (read them carefully — they explain what went wrong)
  - Next steps or required actions
  - The flag `{FLG:...}` which signals task completion
- Between each API call, respect rate limits. After receiving a response:
  1. Check rate-limit headers
  2. If remaining requests = 0, calculate wait time until reset and sleep
  3. Log the wait time so the user knows what's happening

#### 3d. Handle rate limit waiting

After **every** API call, implement this logic:

```typescript
// After each response, check rate limit headers
// If remaining = 0, calculate seconds until reset
// Log: "[s01e05] Rate limit reached. Waiting Xs until reset..."
// Sleep until reset time
// Log: "[s01e05] Rate limit reset. Continuing..."
```

#### 3e. Handle errors

- If the API returns an error message (not 503), log it and decide:
  - If it's a parameter error → fix the parameter and retry
  - If it's a sequence error → adjust the action order
  - If it's rate-limit related → wait and retry
- Never silently swallow errors

---

### 4. Structured logging

Add structured console logging at every key step using `[s01e05]` prefix:

```
[s01e05] Starting railway route activation task...
[s01e05] Calling action: help
[s01e05] Response: { ... full help response ... }
[s01e05] Rate limit: X remaining, resets at Y
[s01e05] Calling action: <next-action> with params: { ... }
[s01e05] Response: { ... }
[s01e05] Rate limit reached. Waiting 30s until reset...
[s01e05] Rate limit reset. Continuing...
[s01e05] Calling action: <activate-action> with params: { ... }
[s01e05] Response: { ... }
[s01e05] FLAG FOUND: {FLG:...}
```

---

### 5. Run and iterate

1. Run the script: `npx tsx lessons/S01E05/index.ts`
2. Read the `help` response carefully — it tells you everything
3. Follow the action sequence from the documentation
4. If an action fails, read the error message — it tells you what's wrong
5. Be patient with 503 errors and rate limits — the retry logic handles 503s, and you must wait for rate limit resets
6. Continue until the API returns `{FLG:...}`

**Important:** The API is intentionally slow and unreliable. A successful run may take several minutes due to:
- Multiple 503 retries
- Rate limit waits between calls
- Multiple sequential actions required

---

### 6. Create backend router — `backend/src/lessons/s01e05.ts`

Follow the pattern from `/.ai/lessons.md`:
- Export `s01e05Router` with `POST /run` endpoint
- Import business logic from `@ai-devs-4/s01e05` — do NOT duplicate logic
- Return structured `{ steps: LogEntry[], flag?: string }` response
- Add `@ai-devs-4/s01e05` to `backend/package.json` dependencies
- Mount in `backend/src/index.ts` as `/api/lessons/s01e05`

---

### 7. Create frontend lesson — `frontend/src/lessons/S01E05.ts`

Follow the pattern from `/.ai/lessons.md`:
- Register via `registerLesson()` with id `S01E05`, title `"Railway Route Activation"`, description `"Activate route X-01 via self-documenting API"`
- Call backend `POST /api/lessons/s01e05/run`
- Add side-effect import `import './lessons/S01E05.js';` in `frontend/src/main.tsx`
- Use theme tokens from `frontend/src/styles/theme.ts`

---

### 8. Update READMEs

- Update `lessons/S01E05/README.md` with approach taken and flag received
- Update `general/README.md` with the new `resilient-fetch.ts` module documentation

---

## Technical Notes

- **API is self-documenting:** The `help` action returns all the information needed. Do not look for documentation elsewhere.
- **503 is expected:** The API deliberately returns 503 to simulate server overload. Retry with exponential backoff.
- **Rate limits are strict:** Check response headers after every call. Wait until reset before making another request. Aggressive polling will cause longer lockouts.
- **Error messages are hints:** If an action fails, the error message explains exactly what's wrong. Read it carefully.
- **Action names and parameters are exact:** Use precisely the names from the `help` response. Do not guess or abbreviate.
- **Route name is X-01:** This is the route that needs to be activated.
- **Task name is `railway`:** All API calls use `"task": "railway"`.
- **Flag format:** Success is signaled by `{FLG:...}` in the response message.

## Verification Checklist

1. `help` action was called and response was fully read and logged
2. All subsequent actions follow the exact sequence from the help documentation
3. Action names and parameters match the API documentation exactly
4. 503 errors are retried automatically with exponential backoff
5. Rate limit headers are checked after every response
6. Script waits until rate limit reset before making new requests
7. All API calls and responses are logged with `[s01e05]` prefix
8. Error messages are logged and acted upon
9. Hub API returns `{FLG:...}` on successful route activation
10. Backend router and frontend lesson are created following project conventions
