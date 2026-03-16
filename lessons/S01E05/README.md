# S01E05 — Railway Route Activation

## Task

Activate railway route **X-01** using a self-documenting API at `https://hub.ag3nts.org/verify` (task: `railway`). The API describes itself via the `help` action and deliberately returns 503 errors with strict rate limits.

## Approach

1. Call `{ "action": "help" }` to discover all available actions and their parameters
2. Follow the documented action sequence exactly as specified by the API
3. Use `resilientFetch` from `/general` to handle 503 retries with exponential backoff
4. Respect rate limit headers after every call — wait until reset if exhausted

## Result

Flag: `pending`

## Reusable Patterns

- `general/src/resilient-fetch.ts` — generic HTTP client with 503/429 retry and rate-limit awareness
