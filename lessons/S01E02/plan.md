# S01E02 — Track Suspect Near Power Plant (`findhim`)

## Context

Task: find which suspect from S01E01 (transport-tagged males from Grudziądz) was spotted near a nuclear power plant. Cross-reference their GPS coordinates with power plant locations, determine their access level, and submit the result.

S01E01 doesn't persist its results, so we also need a shared SQLite data store (`general/src/data-store.ts`) so that future lessons can reuse outputs from previous ones.

---

## Pre-Implementation

**Before writing any code, read these files:**
- `/.ai/README.md`
- `/.ai/conventions.md`
- `/.ai/lessons.md`
- `/.ai/front-end-rules.md`
- `/general/README.md`
- `/lessons/S01E01/index.ts` (to understand suspect data shape)

---

## Implementation Steps

### 1. Create shared SQLite data store — `general/src/data-store.ts`

Install `better-sqlite3` and its types in the `general` workspace:

```bash
cd /home/user/ai-devs-4/general && npm install better-sqlite3 && npm install -D @types/better-sqlite3
```

Create `general/src/data-store.ts` with a simple key-value API backed by SQLite at `data/store.db`.

Schema:
```sql
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
```

Exports:
- `saveToStore(key: string, value: unknown): void` — JSON-serializes value and upserts into `kv` table
- `getFromStore<T>(key: string): T | undefined` — reads and JSON-parses, returns undefined if key missing
- `deleteFromStore(key: string): void` — removes a key

Use `better-sqlite3` (synchronous API — no async needed). Store file at project root: `data/store.db`.

After creating:
- Export from `general/src/index.ts`
- Update `general/README.md` with module docs (description, exports, usage example)
- Add `data/` to root `.gitignore`

### 2. Update S01E01 to persist suspects data

In `lessons/S01E01/index.ts`, after filtering transport-tagged people and **before** submitting the answer, save the suspects list to the data store:

```typescript
import { saveToStore } from '@ai-devs-4/general';

// After filtering transport people:
await saveToStore('s01e01_suspects', transportPeople);
console.log(`[s01e01] Saved ${transportPeople.length} suspects to data store`);
```

Each suspect record contains: `{ name, surname, born, gender, city, tags }`.

### 3. Create lesson directory structure for S01E02

Create these files following the templates in `/.ai/lessons.md`:

- `lessons/S01E02/README.md` — task description and approach
- `lessons/S01E02/package.json` — workspace package
- `lessons/S01E02/tsconfig.json` — standalone tsconfig (do NOT extend root — see `/.ai/lessons.md`)
- `lessons/S01E02/index.ts` — main solution script

### 4. Implement `lessons/S01E02/index.ts`

#### 4a. Load suspects from data store

```typescript
import { config, submitAnswer, getFromStore } from '@ai-devs-4/general';

interface Suspect {
  name: string;
  surname: string;
  born: number; // year as integer
  gender: string;
  city: string;
  tags: string[];
}

const suspects = getFromStore<Suspect[]>('s01e01_suspects');
if (!suspects || suspects.length === 0) {
  console.error('[s01e02] No suspects in store. Run S01E01 first.');
  process.exit(1);
}
console.log(`[s01e02] Loaded ${suspects.length} suspects from store`);
```

#### 4b. Fetch power plant locations

```
GET https://hub.ag3nts.org/data/${config.AIDEVS_API_KEY}/findhim_locations.json
```

Validate with Zod. **Log the raw response first** to understand the data shape — it may contain city names, coordinates, or both. Adapt parsing accordingly.

#### 4c. Resolve power plant GPS coordinates

If the JSON contains city/location names instead of lat/lng coordinates, use OpenAI to convert location names to approximate GPS coordinates. If it already has coordinates, skip this step.

#### 4d. For each suspect — fetch their sighting locations

For each suspect, call:

```
POST https://hub.ag3nts.org/api/location
Content-Type: application/json
Body: { "apikey": "<AIDEVS_API_KEY>", "name": "<name>", "surname": "<surname>" }
```

Response: list of coordinate pairs where the person was seen.

Add a small delay (~200ms) between calls to avoid rate limiting.

#### 4e. Implement Haversine distance function

```typescript
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
```

#### 4f. Find the closest suspect–power plant pair

For every combination of (suspect, sighting_location, power_plant), compute the Haversine distance. Track the global minimum. The suspect with the smallest distance to any power plant is the answer.

Log all distances to aid debugging. Example:

```
[s01e02] Jan Kowalski — sighting (52.23, 21.01) → Plant PWR1234PL (52.30, 20.95): 8.7 km
```

#### 4g. Fetch access level for the identified suspect

```
POST https://hub.ag3nts.org/api/accesslevel
Content-Type: application/json
Body: { "apikey": "<key>", "name": "<name>", "surname": "<surname>", "birthYear": <integer> }
```

**Important:** `birthYear` must be an integer (e.g., `1987`). The `born` field from S01E01 is already an integer year.

#### 4h. Submit the answer

```typescript
const answer = {
  name: suspect.name,
  surname: suspect.surname,
  accessLevel: accessLevelFromApi,
  powerPlant: matchedPlantCode, // format: PWR0000PL
};

const result = await submitAnswer({ task: 'findhim', answer });
console.log('[s01e02] Flag:', result.message);
```

Save the flag to the data store too: `saveToStore('s01e02_flag', result.message)`.

### 5. Create backend router — `backend/src/lessons/s01e02.ts`

Follow the pattern from `/.ai/lessons.md`:
- Export `s01e02Router` with `POST /run` endpoint
- Return structured `{ steps: LogEntry[], flag?: string }` response
- Mount in `backend/src/index.ts` as `/api/lessons/s01e02`

### 6. Create frontend lesson — `frontend/src/lessons/S01E02.ts`

Follow the pattern from `/.ai/lessons.md`:
- Register via `registerLesson()` with id `S01E02`, name `"Track Suspect"`, description `"Find suspect near power plant"`
- Call backend `POST /api/lessons/s01e02/run`
- Forward log entries to Console component
- Add side-effect import `import './lessons/S01E02.js';` in `frontend/src/main.tsx`
- Use theme tokens from `frontend/src/styles/theme.ts` — no hardcoded Tailwind classes

### 7. Run & verify

```bash
# First, run S01E01 to populate the data store with suspects
npx tsx lessons/S01E01/index.ts

# Then run S01E02
npx tsx lessons/S01E02/index.ts
```

Expected: Hub API returns `{FLG:...}` in `result.message`.

### 8. Update READMEs

- Update `lessons/S01E02/README.md` with approach taken and flag received
- Update `general/README.md` with `data-store.ts` module documentation

---

## Technical Notes

- **Power plant coordinates**: `findhim_locations.json` may contain city names, not coordinates. Log raw data first. If needed, use OpenAI to geocode (well-known Polish locations are easy for LLMs).
- **Distance**: Find the suspect with the MINIMUM distance to any power plant — no fixed threshold.
- **API rate limiting**: Add 200ms delay between successive API calls.
- **Error handling**: Log each API call and response. If a suspect's location endpoint returns empty or error, skip them and continue.
- **Structured logging**: Use `[s01e02]` prefix for all console output.
- **`better-sqlite3` is synchronous**: No need for async/await on store operations (but the function signatures can still be sync — simpler).

## Verification Checklist

1. `data/store.db` exists after running S01E01 and contains suspects under key `s01e01_suspects`
2. S01E02 logs show: suspects loaded → plants fetched → locations fetched per suspect → distances computed → closest match found → access level fetched → answer submitted → flag received
3. Frontend: start backend + frontend, navigate to S01E02 lesson, click Run — observe logs and flag
