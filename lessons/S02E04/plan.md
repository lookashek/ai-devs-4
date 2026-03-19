# Implementation Plan — S02E04

## 0. Pre-work: Read Agent Guidelines

- Read ALL files from the `/.ai` directory. They contain coding conventions and behavioral rules.
- Apply those guidelines throughout the entire implementation.
- Do NOT copy their contents — just read and follow them.

## 1. Check Reusable Tools

- Go to `/general` directory.
- Read the `README.md` there to understand what utilities already exist.
- **Reuse these existing modules:**
  - `config` — for accessing `AIDEVS_API_KEY` and other env vars (from `@ai-devs-4/general`)
  - `submitAnswer` — for submitting the final answer to the Hub API (from `@ai-devs-4/general`)
  - `resilientFetch` — for making HTTP requests with automatic retry on 503/429 (from `@ai-devs-4/general`)
- No new general utility is needed for this task.

## 2. Environment Variables

- Read `.env.example` in the project root to learn available variable names.
- Do NOT read or ask for `.env` — you have no access to it. Assume it exists and is populated.
- Required variables already exist: `AIDEVS_API_KEY` (for zmail API and Hub), `OPENAI_API_KEY` (for optional LLM extraction).
- No new environment variables are needed for this task.

## 3. Task Breakdown

### Step 3.1: Create lesson scaffolding

Create the following files in `lessons/S02E04/`:

- **`package.json`** — workspace package `@ai-devs-4/s02e04` with `"start": "tsx index.ts"` script, dependencies on `@ai-devs-4/general` and `zod`.
- **`tsconfig.json`** — standard lesson TypeScript config (see other lessons for template).
- **`README.md`** — task description: "Search an operator's email inbox via the zmail API to extract three values (date, password, confirmation_code) and submit them to the Hub."

### Step 3.2: Implement the zmail API client functions

In `lessons/S02E04/index.ts`, create exported helper functions for interacting with the zmail API:

- **`zmailRequest(action: string, params?: Record<string, unknown>): Promise<unknown>`**
  - POST to `https://hub.ag3nts.org/api/zmail`
  - Body: `{ apikey: config.AIDEVS_API_KEY, action, ...params }`
  - Use `resilientFetch` from general
  - Return the parsed JSON response

- **`getHelp(): Promise<unknown>`**
  - Call `zmailRequest('help')` and return the result
  - Log the available actions so you know the exact API shape

- **`getInbox(page?: number): Promise<MailListResponse>`**
  - Call `zmailRequest('getInbox', { page: page ?? 1 })`
  - Validate response with a Zod schema

- **`searchMail(query: string, page?: number): Promise<MailListResponse>`**
  - Call the appropriate search action discovered from `help` (likely `search` or `searchInbox`)
  - Pass the query string and page number
  - Validate response with Zod

- **`getMessage(messageId: string): Promise<MailMessage>`**
  - Call the appropriate get-message action discovered from `help` (likely `getMessage` or `readMessage`)
  - Pass the message ID
  - Validate response with Zod

**Important:** The exact action names and parameter names must be discovered by calling `help` first. The function signatures above are best guesses — adjust based on the actual API response.

### Step 3.3: Define Zod schemas for API responses

Define schemas for:

```typescript
// Mail list item (metadata only, no body)
const MailItemSchema = z.object({
  id: z.string(),
  subject: z.string(),
  from: z.string(),
  date: z.string(),
  // ... other fields as returned by the API
});

// Full mail message (includes body)
const MailMessageSchema = z.object({
  id: z.string(),
  subject: z.string(),
  from: z.string(),
  date: z.string(),
  body: z.string(),
  // ... other fields
});
```

Adjust field names based on actual API responses from the `help` call.

### Step 3.4: Implement the agent search loop

Create the main agent loop in `main()`. The loop should:

1. **Call `help`** to discover exact API actions and parameters. Log the result.

2. **Search for Wiktor's email** using query `from:proton.me`. Wiktor sent from proton.me domain. Get the full message content. Look for any of the three target values.

3. **Search for security-related emails** using queries like:
   - `subject:security` or `security`
   - `subject:password` or `password`
   - `subject:ticket` or `SEC-`
   - `subject:atak` (Polish for "attack")
   - `confirmation` or `confirmation_code`

4. **For each search result**, retrieve the full message content using the get-message action.

5. **Extract target values** from message bodies:
   - **date**: Look for dates in `YYYY-MM-DD` format related to an attack on the power plant
   - **password**: Look for passwords, credentials, or login information
   - **confirmation_code**: Look for strings matching `SEC-` followed by exactly 28 characters (32 total)

6. **Track found values** in a state object:
   ```typescript
   interface FoundData {
     date: string | undefined;
     password: string | undefined;
     confirmation_code: string | undefined;
   }
   ```

7. **Submit partial/complete answers** to the Hub using `submitAnswer({ task: 'mailbox', answer: foundData })`.

8. **Parse Hub feedback** — the response will indicate which values are correct/missing/wrong.

9. **Retry loop** — if not all values are found or correct:
   - Try different search queries
   - Re-check inbox (new messages may have arrived)
   - Use broader queries (`getInbox` to list all messages)
   - Read ALL messages if targeted search fails
   - Wait briefly and retry (the inbox is dynamic)

10. **Terminate** when the Hub response contains `{FLG:...}`.

### Step 3.5: Implement value extraction helpers

Create focused extraction functions:

- **`extractDate(text: string): string | undefined`**
  - Use regex to find `YYYY-MM-DD` patterns
  - Look for context clues like "atak" (attack), "data" (date), "planowany" (planned)

- **`extractPassword(text: string): string | undefined`**
  - Look for keywords: "hasło" (password), "password", "credentials", "login"
  - Extract the value following these keywords

- **`extractConfirmationCode(text: string): string | undefined`**
  - Use regex: `/SEC-[A-Za-z0-9]{28}/` (or similar pattern)
  - The code is exactly 32 characters total (SEC- + 28)

### Step 3.6: Implement the main function with retry logic

```
main() flow:
1. Call help → log available actions
2. Initialize foundData = { date: undefined, password: undefined, confirmation_code: undefined }
3. MAX_RETRIES = 10 (or similar)
4. Loop:
   a. Run targeted searches for missing values
   b. Read full messages for all results
   c. Extract values from message bodies
   d. If any new values found, submit to Hub
   e. If Hub returns flag → log flag, exit success
   f. If all queries exhausted and values still missing → wait 5 seconds, retry
   g. If max retries reached → log failure, exit
```

Guard `main()` with the `isMain` pattern:
```typescript
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) { main().catch(console.error); }
```

### Step 3.7: Export core functions for backend integration

Export all meaningful functions from `index.ts`:
- `TASK` constant (`'mailbox'`)
- `zmailRequest`, `getHelp`, `getInbox`, `searchMail`, `getMessage`
- `extractDate`, `extractPassword`, `extractConfirmationCode`
- `main` (if needed for backend router)

## 4. Expected Solution Shape

- Main file location: `lessons/S02E04/index.ts`
- The script must be runnable end-to-end with: `npm start` (from `lessons/S02E04/`) or `npx tsx lessons/S02E04/index.ts`
- It must: call help → search inbox → read messages → extract values → submit answer → print flag
- It must use `config`, `submitAnswer`, and `resilientFetch` from `@ai-devs-4/general`
- It must handle errors and log meaningful messages with `[mailbox]` prefix
- It must handle the dynamic inbox (retry on missing values)

## 5. Acceptance Criteria

- [ ] Script runs without errors via `npm start` or `npx tsx lessons/S02E04/index.ts`
- [ ] Correctly calls `help` to discover API actions before using them
- [ ] Searches for emails using appropriate queries (from:proton.me, security keywords)
- [ ] Retrieves full message content before extracting data
- [ ] Extracts all three values: date (YYYY-MM-DD), password, confirmation_code (SEC- + 28 chars)
- [ ] Submits answer to Hub API and receives flag `{FLG:...}`
- [ ] Handles dynamic inbox — retries searches if values not found
- [ ] Uses Hub feedback to determine which values are still missing
- [ ] No hardcoded secrets or API keys — all via `config`
- [ ] Reusable utilities from `@ai-devs-4/general` are used (config, submitAnswer, resilientFetch)
- [ ] All core functions exported from index.ts
- [ ] Structured logging with `[mailbox]` prefix
- [ ] Zod validation on API responses
