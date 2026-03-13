# S01E04 — Transport Declaration for SPK (`sendit`)

## Context

Task: fill out a transport declaration form for the SPK (System Przesyłek Konduktorskich) system and submit it to the Hub API. The declaration must follow the exact template from the SPK documentation. The shipment is reactor fuel cassettes from Gdańsk to Żarnowiec, weighing 2800 kg, using a fake sender ID. The shipment must be free (0 PP cost) — find a package category that is financed by the System. No special remarks should be added.

---

## Pre-Implementation

**Before writing any code, read these files:**
- `/.ai/README.md`
- `/.ai/conventions.md`
- `/.ai/lessons.md`
- `/.ai/front-end-rules.md`
- `/general/README.md`

Check whether any reusable utilities already exist in `/general` that can be leveraged (e.g., `config.ts` for env vars, `hub-api.ts` for task submission, `openai-client.ts` for LLM calls). Reuse them. If a new generic utility is needed, create it in `/general/src/` and update `/general/README.md`.

---

## Implementation Steps

### 1. Create reusable utilities in `/general`

Before starting the lesson, create two new reusable modules in `/general/src/`. These will be useful across multiple lessons.

#### 1a. Create `general/src/file-downloader.ts` — File Download Utility

A generic utility for downloading files from URLs. It should:

- Export a `downloadFile(url: string, outputPath: string): Promise<string>` function that downloads any file (text, binary, image) from a URL and saves it to disk at `outputPath`. Returns the absolute path of the saved file.
- Export a `fetchText(url: string): Promise<string>` function that fetches a URL and returns its content as a string (for `.md`, `.txt`, `.json`, etc.).
- Export a `fetchAndFollowLinks(baseUrl: string, indexPath: string, outputDir: string): Promise<DownloadedFile[]>` function that:
  1. Fetches an index/markdown file from `baseUrl + indexPath`
  2. Parses it for all relative links to other files (markdown links like `[text](path)` and image references like `![alt](path)`)
  3. Downloads ALL referenced files to `outputDir`, preserving relative paths
  4. Returns an array of `{ url: string, localPath: string, type: 'text' | 'image' }` for each downloaded file
- Handle HTTP errors gracefully with meaningful error messages
- Use native `fetch` (Node 18+) — no extra dependencies needed

#### 1b. Create `general/src/image-to-text.ts` — Image Description Utility

A generic utility for extracting text/information from images using OpenAI's vision capabilities. It should:

- Export an `imageToText(imagePath: string, prompt?: string): Promise<string>` function that:
  1. Reads an image file from disk (supports `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`)
  2. Converts it to base64
  3. Sends it to OpenAI's vision-capable model (e.g., `gpt-4o`) with a prompt asking to describe/extract all text and data from the image
  4. Returns the model's text response
- The `prompt` parameter is optional — default to something like `"Extract and return ALL text, data, tables, and information visible in this image. Preserve the original formatting and structure as much as possible."`
- Reuse the existing `openai` client from `general/src/openai-client.ts`
- No extra dependencies needed

#### 1c. Export and document both modules

1. Add exports for both new modules in `general/src/index.ts`
2. Update `general/README.md` with documentation sections for both modules (description, exports, usage examples) — follow the existing format

#### 1d. Run `npm install` from the project root to ensure everything links correctly.

### 2. Create lesson directory structure for S01E04

Create these files following the templates in `/.ai/lessons.md`:

- `lessons/S01E04/README.md` — task description and approach
- `lessons/S01E04/package.json` — workspace package (`@ai-devs-4/s01e04`)
- `lessons/S01E04/tsconfig.json` — standalone tsconfig (do NOT extend root — see `/.ai/lessons.md`)
- `lessons/S01E04/index.ts` — main solution script

Run `npm install` from the project root after creating the package.json to link the workspace.

### 3. Fetch and read ALL SPK documentation

Use the new `fetchAndFollowLinks` utility from `@ai-devs-4/general` to download the entire documentation tree:

```typescript
import { fetchAndFollowLinks } from '@ai-devs-4/general';

const files = await fetchAndFollowLinks(
  'https://hub.ag3nts.org/dane/doc/',
  'index.md',
  './lessons/S01E04/docs'
);
```

This will:
1. Fetch `https://hub.ag3nts.org/dane/doc/index.md`
2. Parse it for all links to other files
3. Download every referenced file to `lessons/S01E04/docs/`

**Critical:** The index references multiple other files (attachments, appendices, route maps, fee tables, etc.). Verify all referenced files were downloaded. If `fetchAndFollowLinks` misses any (e.g., nested references), manually fetch them using `fetchText` or `downloadFile`.

For any downloaded **image files**, use the `imageToText` utility to extract their contents:

```typescript
import { imageToText } from '@ai-devs-4/general';

const imageContent = await imageToText('./lessons/S01E04/docs/some-image.png');
```

**Do not skip any file.** The documentation is spread across many files and missing even one could result in an incorrect declaration.

### 4. Identify the declaration template

From the documentation, find the exact template/form for the transport declaration. Note:

- The exact field names and order
- The separators and formatting characters used
- Any mandatory fields and their allowed values
- The template must be reproduced **exactly** — the Hub verifies both values and format

### 5. Determine the correct route code

The shipment goes from **Gdańsk** to **Żarnowiec**. From the documentation:

1. Find the route network/connection map
2. Identify the route code for the Gdańsk → Żarnowiec segment
3. Note: the task mentions this route is "closed" — but we should still use the correct code; the task says "we'll deal with that later"

### 6. Determine the correct package category and fee

The budget is **0 PP** (zero). From the documentation:

1. Find the fee/tariff table
2. Identify which package categories are **financed by the System** (i.e., cost 0 PP to the sender)
3. The contents are "reactor fuel cassettes" — find the category that best matches this type of cargo and is System-financed
4. Calculate or look up the exact fee (should be 0 or System-covered) based on: category, weight (2800 kg), and route

### 7. Fill out the declaration

Using the exact template from step 3, fill in every field with the correct values:

| Data Point | Value |
|---|---|
| Sender ID | `450202122` |
| Origin point | Gdańsk |
| Destination point | Żarnowiec |
| Weight | 2800 kg (2.8 tons) |
| Contents description | Reactor fuel cassettes (use exact Polish wording as appropriate from the documentation) |
| Package category | As determined in step 5 (the one financed by System) |
| Route code | As determined in step 4 |
| Fee/cost | As determined in step 5 (0 PP or System-financed notation) |
| Special remarks | NONE — leave empty or use the "no remarks" format from the template |

**Important considerations:**
- Use exact formatting from the template — separators, field order, spacing
- Use the correct abbreviations and codes as defined in the documentation
- Do not add any extra text, comments, or remarks beyond what is required
- Check if the documentation specifies how "System-financed" shipments should be marked in the fee field

### 8. Implement the submission script

In `lessons/S01E04/index.ts`, implement the solution. **Add structured console logging at every key step** so the user can follow what is happening in the terminal. Use `[s01e04]` prefix for all log messages.

Required log points:
- Starting the script
- Each documentation file being fetched (URL and status)
- Image files being processed (file name)
- Key data extracted from documentation (route code, category, fee)
- The final declaration text before submission
- The Hub API response (success or error message)
- The flag if received

```typescript
import { submitAnswer } from '@ai-devs-4/general';
import { config } from '@ai-devs-4/general';

console.log('[s01e04] Starting transport declaration task...');

// ... fetch docs, process images, extract data ...
console.log('[s01e04] Fetching documentation from:', url);
console.log('[s01e04] Downloaded file:', filePath);
console.log('[s01e04] Processing image:', imagePath);
console.log('[s01e04] Extracted route code:', routeCode);
console.log('[s01e04] Selected category:', category);
console.log('[s01e04] Calculated fee:', fee);

const declaration = `<filled declaration text here>`;
console.log('[s01e04] Final declaration:');
console.log(declaration);

const result = await submitAnswer({
  task: 'sendit',
  answer: {
    declaration: declaration,
  },
});
console.log('[s01e04] Hub response:', result.message);
```

Use the existing `submitAnswer` from `@ai-devs-4/general`. The answer format is:
```json
{
  "task": "sendit",
  "answer": {
    "declaration": "<full declaration text>"
  }
}
```

### 9. Submit and iterate

1. Run the script: `npx tsx lessons/S01E04/index.ts`
2. Check the console logs to verify each step completed correctly
3. If the Hub returns an error, **read the error message carefully** — it contains hints about what to fix
4. Adjust the declaration based on the error feedback
5. Re-submit until the Hub returns `{FLG:...}`

### 10. Create backend router — `backend/src/lessons/s01e04.ts`

Follow the pattern from `/.ai/lessons.md`:
- Export `s01e04Router` with `POST /run` endpoint
- The `/run` endpoint should submit the declaration to the Hub API
- Return structured `{ steps: LogEntry[], flag?: string }` response
- Mount in `backend/src/index.ts` as `/api/lessons/s01e04`

### 11. Create frontend lesson — `frontend/src/lessons/S01E04.ts`

Follow the pattern from `/.ai/lessons.md`:
- Register via `registerLesson()` with id `S01E04`, name `"Transport Declaration"`, description `"SPK transport declaration for reactor fuel"`
- Call backend `POST /api/lessons/s01e04/run`
- Add side-effect import `import './lessons/S01E04.js';` in `frontend/src/main.tsx`
- Use theme tokens from `frontend/src/styles/theme.ts`

### 12. Update READMEs

- Update `lessons/S01E04/README.md` with approach taken and flag received
- Update `general/README.md` if any new shared modules were created

---

## Technical Notes

- **Documentation is multi-file:** The SPK documentation spans multiple files including at least one image. All files must be fetched and read.
- **Image processing:** Some documentation files are images (e.g., route maps, tables). Use vision capabilities to extract data from them.
- **Exact formatting:** The declaration template must be reproduced character-for-character. Even whitespace differences may cause rejection.
- **System-financed category:** The key to 0 PP cost is finding the right package category. Strategic/military shipments or reactor-related cargo likely falls under a category the System finances.
- **Error messages are hints:** If the Hub rejects the declaration, the error message tells you exactly what's wrong. Parse it and fix the specific issue.
- **Route may be listed as closed:** The Gdańsk-Żarnowiec route may appear as blocked/closed in the docs. Use the correct route code anyway — the task says to ignore this for now.

## Verification Checklist

1. All SPK documentation files (including images) have been fetched and read
2. Declaration template matches the exact format from the documentation
3. All fields are filled with correct values and proper codes/abbreviations
4. Package category is one that is financed by the System (0 PP cost)
5. Route code is correct for Gdańsk → Żarnowiec
6. No special remarks are included in the declaration
7. Sender ID is `450202122`
8. Weight is correctly specified as 2800 kg
9. Contents description accurately describes reactor fuel cassettes
10. Hub API returns `{FLG:...}` on submission
