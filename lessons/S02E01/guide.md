# S02E01 — Categorize Items (DNG/NEU Classification)

## Goal
Classify 10 items as dangerous (DNG) or neutral (NEU) by writing a short prompt that fits within a 100-token context window. The prompt is sent to an archaic internal LLM on the hub server.

## Special Override
Reactor/nuclear-related items (e.g., "kasety do reaktora" — reactor cassettes) must ALWAYS be classified as NEU, even if their description sounds dangerous. This is to avoid inspection.

## Input
- CSV file downloaded from: `https://hub.ag3nts.org/data/{AIDEVS_API_KEY}/categorize.csv`
- Contains 10 items with an identifier and description
- CSV content changes every few minutes — must be fetched fresh each run

## Communication Protocol
POST to `https://hub.ag3nts.org/verify` for each item:
```json
{
  "apikey": "<AIDEVS_API_KEY>",
  "task": "categorize",
  "answer": {
    "prompt": "Your classification prompt with {id} and {description} substituted"
  }
}
```

The hub passes the prompt to its internal classification model and returns the result.

## Budget
- Total: 1.5 PP for all 10 queries
- Input tokens: 0.02 PP per 10 tokens
- Cached tokens: 0.01 PP per 10 tokens
- Output tokens: 0.02 PP per 10 tokens
- If budget exceeded or classification error → must start over
- Reset command: send `{ "prompt": "reset" }` as the answer

## Output
- Each prompt must return exactly "DNG" or "NEU"
- When all 10 items are correctly classified, hub returns `{FLG:...}`

## Constraints
- Prompt must fit in ≤100 tokens (including item data)
- Static prefix should be consistent across all items (for cache efficiency)
- Variable data (id, description) should go at the end of the prompt

## Hints
- Use English for token efficiency
- Iterative prompt refinement may be needed
- Hub returns detailed error messages (which item was wrong)
- Use tiktokenizer to check token count
- Place static text first, variable data last (maximizes caching)
