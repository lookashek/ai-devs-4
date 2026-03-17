# S02E01 — Categorize Items

## Task
Classify 10 items from a CSV as dangerous (DNG) or neutral (NEU) using a very short prompt (≤100 tokens) sent to the hub's internal LLM. Reactor/nuclear items must always be classified as NEU.

## Approach
1. Reset the hub's budget counter
2. Fetch fresh CSV with item data
3. Parse CSV rows (id + description)
4. Build a compact prompt template with static classification rules first (for caching) and variable item data at the end
5. Submit prompt for each of the 10 items
6. If errors occur, log hub feedback, reset, and retry with adjusted prompt

## Key Pattern
- Short English prompt with keyword-based classification rules
- Reactor/nuclear override → NEU
- Dangerous keywords (explosive, toxic, weapon, radioactive, etc.) → DNG
- Everything else → NEU

## Solution
See `index.ts` for the full implementation.
