# /general — Shared Modules

This directory contains reusable modules shared across all lessons. **Always check here before implementing anything new.**

---

## Modules

### `config.ts`

Validated environment configuration using Zod. Exits the process on startup if required env vars are missing.

**Exports:** `config: Config`, `Config` type

**Usage:**
```typescript
import { config } from '@ai-devs-4/general';

console.log(config.AIDEVS_API_KEY);
console.log(config.NODE_ENV); // 'development' | 'production' | 'test'
```

---

### `hub-api.ts`

Client for the course Hub API. Submits task answers and returns the response (including `{FLG:...}` flags on success).

**Exports:** `submitAnswer(params)`, `HubResponse` type

**Usage:**
```typescript
import { submitAnswer } from '@ai-devs-4/general';

const result = await submitAnswer({
  task: 'task-name',
  answer: 'computed answer',
});
// result.message contains {FLG:...} on success
```

---

## Adding a New Module

1. Create `src/<module-name>.ts`
2. Export from `src/index.ts`
3. Add a section to this README with: description, exports, usage example
