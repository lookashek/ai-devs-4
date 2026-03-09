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

### `openai-client.ts`

OpenAI client pre-configured from env vars. Model is injected via `OPENAI_MODEL` (default: `gpt-4o`).

**Exports:** `openai` (raw `OpenAI` instance), `chat(messages, options?)`, `ask(userMessage, options?)`, `ChatMessage`, `ChatOptions`

**Usage:**
```typescript
import { ask, chat } from '@ai-devs-4/general';

// Simple one-shot question
const answer = await ask('What is 2+2?', { systemPrompt: 'You are a math tutor.' });

// Full conversation
const reply = await chat(
  [{ role: 'user', content: 'Translate "hello" to Polish.' }],
  { model: 'gpt-4o-mini', temperature: 0 },
);
```

**ChatOptions:**
| Field | Type | Default | Description |
|---|---|---|---|
| `model` | `string` | `OPENAI_MODEL` env var | Override the model per-call |
| `temperature` | `number` | `0.2` | Sampling temperature |
| `maxTokens` | `number` | — | Max tokens to generate |
| `systemPrompt` | `string` | — | Prepended as a system message |

---

## Adding a New Module

1. Create `src/<module-name>.ts`
2. Export from `src/index.ts`
3. Add a section to this README with: description, exports, usage example
