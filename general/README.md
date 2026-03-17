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

### `data-store.ts`

Simple key-value store backed by SQLite (`data/store.db` at project root). Used to persist data between lesson runs (e.g., S01E01 saves suspects, S01E02 reads them).

Uses `better-sqlite3` (synchronous API — no async needed).

**Exports:** `saveToStore(key, value)`, `getFromStore<T>(key)`, `deleteFromStore(key)`

**Usage:**
```typescript
import { saveToStore, getFromStore, deleteFromStore } from '@ai-devs-4/general';

// Save any JSON-serializable value
saveToStore('my_key', { name: 'Jan', score: 42 });

// Read it back (returns undefined if missing)
const data = getFromStore<{ name: string; score: number }>('my_key');

// Delete
deleteFromStore('my_key');
```

---

### `resilient-fetch.ts`

Generic HTTP client wrapper with automatic retry on transient errors (503, 429) and rate-limit awareness.

**Exports:** `resilientFetch(url, options, retryOptions?)`, `RetryOptions` interface

**Usage:**
```typescript
import { resilientFetch } from '@ai-devs-4/general';

const response = await resilientFetch(
  'https://hub.ag3nts.org/verify',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apikey: '...', task: 'railway', answer: { action: 'help' } }),
  },
  { maxRetries: 10, initialDelayMs: 2000, maxDelayMs: 60000 },
);
const data = await response.json();
```

**RetryOptions:**
| Field | Type | Default | Description |
|---|---|---|---|
| `maxRetries` | `number` | `10` | Maximum retry attempts |
| `initialDelayMs` | `number` | `2000` | Initial backoff delay (ms) |
| `maxDelayMs` | `number` | `60000` | Maximum backoff delay (ms) |
| `retryOnStatus` | `number[]` | `[503, 429]` | HTTP status codes to retry |

Features:
- Exponential backoff on 503 (server overload) and 429 (rate limit) responses
- Reads `Retry-After` header on 429 responses
- Checks `X-RateLimit-Remaining` / `RateLimit-Remaining` headers after every response
- Logs all attempts, status codes, and wait times with `[resilient-fetch]` prefix

---

## Adding a New Module

1. Create `src/<module-name>.ts`
2. Export from `src/index.ts`
3. Add a section to this README with: description, exports, usage example
