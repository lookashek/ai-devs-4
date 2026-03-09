# PROD.md — AI Devs 4 Course Solution Workspace

## What is this project?

This monorepo contains our solutions for the **AI Devs 4** course — a 5-week, cohort-based Polish program focused on building production-ready AI applications. Each lesson includes a programming task that typically involves: fetching data, processing it (often with LLMs), and submitting the answer to the course Hub API.

### Hub API (task submission)

All task answers are submitted via **POST** to `https://hub.ag3nts.org/verify` with the following JSON body:

```json
{
  "apikey": "<API_KEY>",
  "task": "<task-name>",
  "answer": "<answer — type varies per task>"
}
```

The Hub responds with either an error or a flag in the format `{FLG:...}`. The API key is stored in the `.env` file as `AIDEVS_API_KEY`.

---

## Stack

- **Runtime & package manager:** Node.js + npm (simple npm workspaces monorepo)
- **Language:** TypeScript (strict mode)
- **Backend:** Express or Fastify (per-lesson HTTP server for task solutions)
- **Frontend:** React + Tailwind CSS (dark futuristic UI — shared lesson template)
- **LLM providers:** OpenAI, Anthropic, and potentially others — abstracted in `/general`
- **Environment variables:** managed via `.env` file at root (never committed)

---

## Project Structure

```
/
├── general/          # Shared, reusable modules (LLM clients, Hub API, utilities)
│   └── README.md     # Describes every module in /general — ALWAYS read this first
├── lessons/          # One directory per lesson solution
│   ├── S01E01/
│   │   └── README.md # Describes this lesson's task, approach, and solution
│   ├── S01E02/
│   └── ...
├── PROD.md           # THIS FILE — always include in agent context
├── .env              # API keys (AIDEVS_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY)
└── package.json
```

### `/general` — Shared modules

Contains reusable code used across lessons: Hub API client, LLM provider wrappers (OpenAI, Anthropic), common utilities (file fetching, CSV parsing, etc.). **The `README.md` in `/general` is the source of truth** for what exists and how to use it. Before implementing anything new, check if it already exists there.

**Rule:** When you create or modify a module in `/general`, you MUST update its `README.md` with a short description of what the module does, its exports, and usage example.

### `/lessons` — Lesson solutions

Each lesson lives in its own directory (e.g., `S01E01`). Naming follows the course convention: `S{week}E{episode}`.

**Rule:** Each lesson directory MUST contain a `README.md` describing:
- The task (what needs to be solved)
- The approach taken
- Any reusable patterns or modules created

---

## TypeScript Best Practices

1. **Strict mode always** — `"strict": true` in tsconfig. No `any` unless absolutely unavoidable (and then annotate with `// eslint-disable-next-line` + comment why).
2. **Explicit return types** on exported functions and public methods.
3. **Prefer `interface` for object shapes**, `type` for unions/intersections/utility types.
4. **Use `const` by default**, `let` only when mutation is needed, never `var`.
5. **Null safety** — prefer `undefined` over `null`, use optional chaining (`?.`) and nullish coalescing (`??`).
6. **Enums** — prefer `as const` objects or union types over TypeScript enums.
7. **Error handling** — use typed errors or Result patterns. Never silently swallow errors. Always log meaningful context.
8. **Zod for runtime validation** — validate all external data (API responses, CSV data, user input) with Zod schemas. Derive TypeScript types from Zod schemas with `z.infer<>`.
9. **No magic strings/numbers** — extract to named constants.
10. **Small, focused functions** — single responsibility, max ~30 lines. If a function needs a comment explaining *what* it does, it should be split or renamed.

## React Best Practices

1. **Functional components only** — no class components.
2. **Custom hooks for logic** — extract business logic into `use*` hooks, keep components focused on rendering.
3. **Memoize wisely** — use `useMemo`/`useCallback` only when there's a measurable performance reason, not by default.
4. **Component files** — one component per file, filename matches component name.
5. **Props** — define with `interface`, destructure in function signature, provide defaults where sensible.
6. **State management** — keep state as local as possible. Lift only when needed. Use context sparingly.
7. **Avoid inline styles** — use Tailwind utility classes exclusively.
8. **Key prop** — always use stable, unique keys in lists (never array index unless list is static).

## General Code Practices

1. **DRY across lessons** — if you use something twice, move it to `/general`.
2. **README-driven development** — update README.md files BEFORE or right after implementation.
3. **Environment variables** — access through a validated config module, not raw `process.env` scattered in code.
4. **Logging** — use structured logging. Include task name, step, and relevant data in log messages.
5. **Structured Output from LLMs** — prefer JSON schema / Zod-validated structured output over free-text parsing.
6. **Batch LLM calls** when possible — send multiple items in one request to reduce API calls and cost.