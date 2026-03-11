# Coding Conventions

Quick reference for the most important conventions. Full detail in `PROD.md` and `CLAUDE.md`.

## TypeScript

- `strict: true` — no `any` without explicit comment explaining why
- Explicit return types on all exported functions
- `interface` for shapes, `type` for unions/utilities
- `const` by default, `let` only when mutation is needed
- `undefined` over `null`; use `?.` and `??`
- No TypeScript `enum` — use `as const` or union string types
- Zod validates **all** external data; derive types via `z.infer<>`
- Named constants for all magic values
- Max ~30 lines per function

## Imports & Modules

- Use `.js` extension in imports even for `.ts` files (ESM)
- Shared code → `/general/src/`; export from `/general/src/index.ts`
- Env vars → only through `config` from `@ai-devs-4/general`
- **Backend routers import business logic from lesson packages (`@ai-devs-4/s0xey`) — never duplicate it inline**
- Lesson `index.ts` exports all core functions/types; `main()` is guarded with `isMain` so the module can be safely imported by the backend without triggering side-effects

## Logging

```typescript
console.log(`[task-name] step description`, { relevantData });
console.error(`[task-name] error context`, error);
```

## LLM Output

- Always prefer structured output (JSON mode / tool_use)
- Validate LLM responses with Zod before using
- Batch calls where possible (multiple items per request)

## Frontend

- All styling via Tailwind utility classes — no inline styles, no CSS modules
- All color/component tokens in `frontend/src/styles/theme.ts`
- Functional components only; business logic in `use*` hooks
- One component per file; filename = component name
