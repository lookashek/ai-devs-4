# Lesson Implementation Instructions

Use this guide when implementing a new AI Devs 4 lesson solution.

## Checklist

- [ ] Read the task description from the course
- [ ] Check `general/README.md` for existing utilities
- [ ] Create `lessons/S0XEY/README.md` with task + approach
- [ ] Create `lessons/S0XEY/package.json` and `tsconfig.json`
- [ ] Implement `lessons/S0XEY/index.ts` (standalone script)
- [ ] Create `backend/src/lessons/s0xey.ts` (Express router)
- [ ] Mount router in `backend/src/index.ts`
- [ ] Create `frontend/src/lessons/S0XEY.ts` and register it
- [ ] Add side-effect import to `frontend/src/main.tsx`
- [ ] Submit answer to Hub API and record the flag
- [ ] Move any reusable code to `/general` and update `general/README.md`

---

## Utilities and helper functions that are useful across multiple lessons should be find in `general/README.md`
Use available tools from this module first, if you find that something from lessons can be abstracted into a reusable utility, implement it.
Before doing this, please ask user, explain briefly what you want to implement and why, and ask for confirmation to proceed. 
This way we can avoid unnecessary abstractions and keep the codebase clean and maintainable.

When you create a new module in `general/`, also update `general/README.md` with:

## Directory Structure Per Lesson

```
lessons/S0XEY/
├── README.md       # Task description, approach, flag (if obtained)
├── index.ts        # Standalone solution — runs via tsx
├── package.json    # Workspace package
└── tsconfig.json   # Standalone tsconfig (does NOT extend root)

backend/src/lessons/
└── s0xey.ts        # Express Router with /run endpoint

frontend/src/lessons/
└── S0XEY.ts        # Registers lesson in sidebar via registerLesson()
```

---

## 1. Standalone Script — `lessons/S0XEY/index.ts`

Imports from `@ai-devs-4/general`. Run with:

```bash
npx tsx lessons/S0XEY/index.ts
```

**CRITICAL: All business logic must be in exported functions. The `main()` function only orchestrates them.**
The `isMain` guard ensures imports don't trigger side-effects (the backend imports this module).

```typescript
import { fileURLToPath } from 'url';
import { config, submitAnswer, openai } from '@ai-devs-4/general';

// Export ALL core functions and types — the backend router will import them
export const TASK = 'task-name';

export interface MyResult { /* ... */ }

export async function fetchData(): Promise<MyResult[]> {
  // ... fetch logic ...
}

export async function processData(data: MyResult[]): Promise<MyResult[]> {
  // ... processing logic ...
}

async function main(): Promise<void> {
  const data = await fetchData();
  const processed = await processData(data);
  const result = await submitAnswer({ task: TASK, answer: processed });
  console.log('[s0xey] Flag:', result.message);
}

// Guard: only run main() when executed directly, not when imported by backend
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch(err => {
    console.error('[s0xey] Fatal error:', err);
    process.exit(1);
  });
}
```

## 2. `lessons/S0XEY/package.json`

```json
{
  "name": "@ai-devs-4/s0xey",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./index.ts",
  "scripts": {
    "start": "tsx index.ts"
  },
  "dependencies": {
    "@ai-devs-4/general": "*",
    "zod": "^3.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.5.0"
  }
}
```

> **Note:** `"main": "./index.ts"` is required so the backend can import this package via `@ai-devs-4/s0xey`.

## 3. `lessons/S0XEY/tsconfig.json`

Do NOT extend the root tsconfig — it excludes the `lessons/` directory.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "outDir": "./dist",
    "rootDir": "."
  },
  "include": ["index.ts"]
}
```

---

## 4. Backend Router — `backend/src/lessons/s0xey.ts`

Each lesson gets its own Express Router exported as `s0xeyRouter`.
The router exposes a single `POST /run` endpoint.

**CRITICAL: DO NOT duplicate lesson logic here. Import all functions and types from `@ai-devs-4/s0xey`.**
The backend router is ONLY responsible for: HTTP handling, step logging for the frontend, and error formatting.

Before creating the router, add `@ai-devs-4/s0xey` to `backend/package.json` dependencies:
```json
"dependencies": {
  "@ai-devs-4/s0xey": "*"
}
```

```typescript
import { Router } from 'express';
import { config } from '@ai-devs-4/general';
// Import ALL business logic from the lesson package — never reimplement it here
import {
  TASK,
  fetchData,
  processData,
  type MyResult,
} from '@ai-devs-4/s0xey';

interface LogEntry {
  message: string;
  level: 'info' | 'success' | 'warn' | 'error';
}

export interface RunResponse {
  steps: LogEntry[];
  flag?: string;
}

export const s0xeyRouter = Router();

s0xeyRouter.post('/run', async (_req, res): Promise<void> => {
  const steps: LogEntry[] = [];
  const log = (message: string, level: LogEntry['level'] = 'info'): void => {
    steps.push({ message, level });
    console.log(`[s0xey/${level}] ${message}`);
  };

  try {
    log('Fetching data...');
    const data = await fetchData();
    log(`Fetched ${data.length} records`);

    log('Processing...');
    const result = await processData(data);
    log(`Done: ${result.length} results`, 'success');

    // Submit to Hub API
    log(`Submitting answer (task: ${TASK})...`);
    const hubRes = await fetch('https://hub.ag3nts.org/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apikey: config.AIDEVS_API_KEY, task: TASK, answer: result }),
    });
    const hubData = (await hubRes.json()) as { code: number; message: string };
    log(`Hub response: ${hubData.message}`, hubData.code === 0 ? 'success' : 'warn');

    res.json({ steps, flag: hubData.message } satisfies RunResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Error: ${message}`, 'error');
    res.status(500).json({ steps } satisfies RunResponse);
  }
});
```

Mount it in `backend/src/index.ts` with a single line:

```typescript
import { s0xeyRouter } from './lessons/s0xey.js';
// ...
app.use('/api/lessons/s0xey', s0xeyRouter);
```

---

## 5. Frontend Lesson — `frontend/src/lessons/S0XEY.ts`

Calls the backend `/run` endpoint and forwards each log entry to the Console.

```typescript
import { registerLesson } from './registry.js';
import type { AddLog } from './registry.js';

const BACKEND_URL = 'http://localhost:3001';

interface LogEntry {
  message: string;
  level: 'info' | 'success' | 'warn' | 'error';
}

interface RunResponse {
  steps: LogEntry[];
  flag?: string;
}

async function execute(addLog: AddLog): Promise<void> {
  addLog('Starting S0XEY — <Task Title>...', 'info');

  const res = await fetch(`${BACKEND_URL}/api/lessons/s0xey/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  const data = (await res.json()) as RunResponse;

  for (const step of data.steps) {
    addLog(step.message, step.level);
  }

  if (!res.ok) {
    throw new Error('Lesson execution failed — check backend logs for details');
  }

  if (data.flag) {
    addLog(`Flag received: ${data.flag}`, 'success');
  }
}

registerLesson({
  id: 'S0XEY',
  title: '<Task Title>',
  description: '<One-line task summary>',
  execute,
});
```

Then add a side-effect import in `frontend/src/main.tsx`:

```typescript
// Lesson registrations (side-effect imports — order = sidebar order)
import './lessons/S01E01.js';
import './lessons/S0XEY.js'; // ← add here
```

---

## Debugging Checklist

When a lesson fails or returns unexpected Hub API errors, always add logs for:

- **Exact payload sent to Hub API** — log the full answer object right before submission
- **API responses** — log raw responses from all external APIs (Hub API, lesson-specific endpoints)
- **Data transformations** — log intermediate results when mapping/transforming external data (e.g. city name → code lookups)
- **LLM outputs** — log the raw LLM response before parsing, especially when parsing JSON from it

Example pattern:
```typescript
console.log('[s0xey] ANSWER PAYLOAD:', JSON.stringify(answer));
const result = await submitAnswer({ task: TASK, answer });
console.log('[s0xey] Hub response:', JSON.stringify(result));
```

---

## README.md Template

```markdown
# S0XEY — <Task Title>

## Task

<What the task asks for>

## Approach

<How it was solved — steps taken, models/tools used>

## Result

Flag: `{FLG:...}` (or "pending")

## Reusable Patterns

<Any modules moved to /general or patterns worth noting>
```
