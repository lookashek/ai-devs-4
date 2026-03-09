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

```typescript
import { config, submitAnswer, openai } from '@ai-devs-4/general';

// ... lesson logic ...

const result = await submitAnswer({ task: 'task-name', answer: payload });
console.log('[s0xey] Flag:', result.message);
```

## 2. `lessons/S0XEY/package.json`

```json
{
  "name": "@ai-devs-4/s0xey",
  "version": "0.1.0",
  "private": true,
  "type": "module",
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
The router exposes a single `POST /run` endpoint that runs the full lesson
logic and returns a structured log + optional flag.

```typescript
import { Router } from 'express';
import { config, openai } from '@ai-devs-4/general';

const HUB_URL = 'https://hub.ag3nts.org';

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
    // ... lesson logic, call log() throughout ...
    res.json({ steps, flag: '...' } satisfies RunResponse);
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
