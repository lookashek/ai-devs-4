# CLAUDE.md — AI Devs 4 Course Workspace

## Project Overview

This monorepo contains solutions for the **AI Devs 4** course — a 5-week cohort-based Polish program focused on building production-ready AI applications. Each lesson involves fetching data, processing it (often with LLMs), and submitting answers to the course Hub API.

## Repository Structure

```
/
├── general/          # Shared, reusable modules (LLM clients, Hub API, utilities)
│   └── README.md     # Source of truth — ALWAYS read before implementing anything new
├── lessons/          # One directory per lesson solution
│   ├── S01E01/
│   │   └── README.md # Task description, approach, and solution notes
│   ├── S01E02/
│   └── ...           # Naming: S{week}E{episode}
├── PROD.md           # Project guidelines — always include in agent context
├── CLAUDE.md         # This file
├── .env              # API keys (never committed)
└── package.json      # npm workspaces monorepo root
```

## Hub API (Task Submission)

Submit task answers via **POST** to `https://hub.ag3nts.org/verify`:

```json
{
  "apikey": "<AIDEVS_API_KEY>",
  "task": "<task-name>",
  "answer": "<answer — type varies per task>"
}
```

Response is either an error or a flag in format `{FLG:...}`.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Package manager | npm (workspaces monorepo) |
| Language | TypeScript (strict mode) |
| Backend | Express or Fastify (per-lesson HTTP server) |
| Frontend | React + Tailwind CSS (dark futuristic UI) |
| LLM providers | OpenAI, Anthropic (abstracted in `/general`) |
| Validation | Zod |
| Env vars | `.env` at root |

## Environment Variables

Stored in `.env` at root (never committed). Key variables:
- `AIDEVS_API_KEY` — Course Hub API key
- `OPENAI_API_KEY` — OpenAI API key
- `ANTHROPIC_API_KEY` — Anthropic API key

Access through a validated config module — **never use raw `process.env` scattered in code**.

## Development Workflows

### Starting a New Lesson

1. Read the task description from the course
2. Create `lessons/S0XEY/README.md` describing the task and planned approach
3. Check `general/README.md` for existing utilities before implementing new ones
4. Implement the solution in `lessons/S0XEY/index.ts`
5. Submit answer to Hub API and capture the flag
6. Update `README.md` with the approach taken and any reusable patterns discovered

### Adding a Shared Module

1. Implement in `general/<module-name>.ts`
2. Update `general/README.md` with: description, exports, usage example
3. Use from any lesson via the workspace import

### Running Lessons

Individual lessons are standalone — run with:
```bash
npx ts-node lessons/S0XEY/index.ts
```

Or via npm scripts defined in the lesson's `package.json` (if present).

## Code Conventions

### TypeScript Rules

- **Strict mode always** — `"strict": true` in tsconfig; no `any` unless unavoidable (add `// eslint-disable-next-line` + reason)
- **Explicit return types** on all exported functions and public methods
- **`interface` for object shapes**, `type` for unions/intersections/utility types
- **`const` by default**, `let` only when mutation is needed, never `var`
- **Null safety** — prefer `undefined` over `null`; use `?.` and `??`
- **No enums** — use `as const` objects or union types instead
- **Error handling** — typed errors or Result patterns; never silently swallow errors; always log meaningful context
- **Zod for all external data** — validate API responses, CSV data, user input; derive types via `z.infer<>`
- **No magic strings/numbers** — extract to named constants
- **Small, focused functions** — single responsibility, ~30 lines max

### React Rules (when applicable)

- Functional components only — no class components
- Business logic in custom `use*` hooks, not in components
- `useMemo`/`useCallback` only with measured performance justification
- One component per file; filename matches component name
- Props typed with `interface`, destructured in function signature
- State as local as possible; lift only when needed; context sparingly
- Tailwind utility classes exclusively — no inline styles
- Stable, unique keys in lists (never array index on dynamic lists)

### General Rules

- **DRY** — if something is used twice across lessons, move it to `/general`
- **README-driven** — update `README.md` before or immediately after implementation
- **Structured logging** — include task name, step, and relevant data in every log message
- **Structured LLM output** — prefer JSON schema / Zod-validated structured output over free-text parsing
- **Batch LLM calls** — send multiple items in one request to reduce API calls and cost

## Key Patterns

### Hub API Submission Pattern

```typescript
import { submitAnswer } from '../general/hub-api';

const result = await submitAnswer({
  task: 'task-name',
  answer: computedAnswer,
});
console.log('Flag:', result); // {FLG:...}
```

### LLM Structured Output Pattern

```typescript
import { z } from 'zod';

const ResponseSchema = z.object({
  answer: z.string(),
  confidence: z.number(),
});

type Response = z.infer<typeof ResponseSchema>;

// Use with OpenAI/Anthropic structured output, then validate:
const parsed = ResponseSchema.parse(rawLlmOutput);
```

### Config Module Pattern

```typescript
// general/config.ts — access all env vars through here
import { z } from 'zod';

const ConfigSchema = z.object({
  AIDEVS_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
});

export const config = ConfigSchema.parse(process.env);
```

## Important Notes for AI Assistants

1. **Always read `general/README.md` first** before implementing any shared utility — it may already exist.
2. **Always read `PROD.md`** for the authoritative project guidelines.
3. **Each lesson directory must have a `README.md`** — create or update it with every lesson.
4. **Each `/general` module change requires updating `general/README.md`**.
5. **Never commit `.env`** or any file containing API keys.
6. **Lesson naming is strict**: `S{week}E{episode}` (e.g., `S01E01`, `S02E03`).
7. When the Hub API returns a flag `{FLG:...}`, that is the successful task completion signal.
