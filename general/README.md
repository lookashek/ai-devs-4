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

### `file-downloader.ts`

Generic utility for downloading files from URLs. Supports text and binary files, and can follow markdown links to download entire documentation trees.

**Exports:** `downloadFile(url, outputPath)`, `fetchText(url)`, `fetchAndFollowLinks(baseUrl, indexPath, outputDir)`, `DownloadedFile` type

**Usage:**
```typescript
import { downloadFile, fetchText, fetchAndFollowLinks } from '@ai-devs-4/general';

// Download a single file
const path = await downloadFile('https://example.com/file.png', './output/file.png');

// Fetch text content
const content = await fetchText('https://example.com/doc.md');

// Download an entire documentation tree (follows markdown links)
const files = await fetchAndFollowLinks(
  'https://example.com/docs/',
  'index.md',
  './local-docs'
);
// files: [{ url, localPath, type: 'text' | 'image' }]
```

---

### `image-to-text.ts`

Extract text and information from images using OpenAI's vision capabilities (gpt-4o).

**Exports:** `imageToText(imagePath, prompt?)`

**Usage:**
```typescript
import { imageToText } from '@ai-devs-4/general';

// Extract all text from an image
const text = await imageToText('./screenshot.png');

// Extract with a custom prompt
const data = await imageToText('./table.png', 'Extract the table data as JSON');
```

Supported formats: `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`

---

## Adding a New Module

1. Create `src/<module-name>.ts`
2. Export from `src/index.ts`
3. Add a section to this README with: description, exports, usage example
