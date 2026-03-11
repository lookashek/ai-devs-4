# S01E02 — Track Suspect Near Power Plant

## Task

Find which suspect from S01E01 (transport-tagged males from Grudziądz) was spotted near a nuclear power plant. Cross-reference their GPS coordinates with power plant locations, determine their access level, and submit the result.

## Approach

1. Load suspects from the shared SQLite data store (persisted by S01E01)
2. Fetch power plant locations from `findhim_locations.json`
3. Resolve coordinates (geocode via LLM if locations are city names)
4. For each suspect, fetch sighting locations via `/api/location`
5. Compute Haversine distances between all (sighting, plant) pairs
6. Identify the suspect closest to any power plant
7. Fetch their access level via `/api/accesslevel`
8. Submit structured answer to Hub API

## Result

Flag: pending (run S01E01 then S01E02 to obtain)

## Reusable Patterns

- **Shared data store** (`general/src/data-store.ts`) — SQLite key-value store for cross-lesson data persistence
- **Haversine distance** — used to compute great-circle distance between GPS coordinates
- **Flexible JSON parsing** — multiple Zod schemas tried in sequence to handle unknown API response shapes
