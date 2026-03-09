# S01E01 — People Filter & Tagging

## Task Summary

Fetch a CSV of people who survived the "Great Correction", filter them by criteria, tag their professions using an LLM with Structured Output, and submit the filtered+tagged list to the Hub API.

## Implementation Steps

### 1. Create lesson directory structure

- Create `lessons/S01E01/index.ts` — main entry point
- Create `lessons/S01E01/README.md` — task description and approach notes
- Create `lessons/S01E01/package.json` — minimal workspace package

### 2. Fetch the CSV

- Fetch `https://hub.ag3nts.org/data/${config.AIDEVS_API_KEY}/people.csv` using Node's native `fetch`
- Parse the CSV manually (split by newlines, then by comma/semicolon — check delimiter from actual file)
- Use Zod to validate each row. Expected columns: `name`, `surname`, `gender`, `born` (year as number), `city`, `job`

### 3. Filter people by criteria

Keep only records where ALL of the following are true:
- `gender === 'M'`
- `city === 'Grudziądz'`
- Age in 2026 is between 20 and 40 inclusive: `born >= 1986 && born <= 2006`

### 4. Tag professions using LLM (Structured Output, batch)

Use OpenAI API with `response_format: { type: 'json_schema', json_schema: {...} }` to tag all filtered people in a **single API call**.

Available tags and their descriptions to include in the prompt:
- `IT` — praca z komputerami, oprogramowaniem, sieciami, elektroniką
- `transport` — praca z pojazdami, logistyka, przewóz osób/towarów, kierowcy, spedycja
- `edukacja` — nauczanie, szkolenia, wychowanie
- `medycyna` — opieka zdrowotna, leczenie, farmacja, ratownictwo
- `praca z ludźmi` — obsługa klienta, handel, HR, praca socjalna
- `praca z pojazdami` — mechanika, naprawa pojazdów, obsługa maszyn
- `praca fizyczna` — budownictwo, magazynowanie, rolnictwo, rzemiosło

Prompt strategy (batch): Send a numbered list of `job` descriptions and ask the model to return a JSON array of objects with `{ index: number, tags: string[] }`.

JSON Schema for `response_format`:
```json
{
  "type": "object",
  "properties": {
    "results": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "index": { "type": "integer" },
          "tags": {
            "type": "array",
            "items": {
              "type": "string",
              "enum": ["IT", "transport", "edukacja", "medycyna", "praca z ludźmi", "praca z pojazdami", "praca fizyczna"]
            }
          }
        },
        "required": ["index", "tags"],
        "additionalProperties": false
      }
    }
  },
  "required": ["results"],
  "additionalProperties": false
}
```

Use OpenAI SDK (`openai` npm package, already available via workspace or install it):
```typescript
import OpenAI from 'openai';
const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
```

Model: `gpt-4o-mini` (cheap, fast, supports structured output).

### 5. Filter by `transport` tag

After tagging, keep only people whose tags array includes `'transport'`.

### 6. Build the answer payload

Map filtered+tagged people to the required format:
```typescript
{
  name: string,
  surname: string,
  gender: string,   // 'M' or 'F'
  born: number,     // year as integer
  city: string,
  tags: string[]
}
```

### 7. Submit to Hub API

Use the existing `submitAnswer` from `@ai-devs-4/general`:
```typescript
import { submitAnswer } from '@ai-devs-4/general';

const result = await submitAnswer({ task: 'people', answer: payload });
console.log('Flag:', result.message);
```

### 8. Package setup

Create `lessons/S01E01/package.json`:
```json
{
  "name": "@ai-devs-4/s01e01",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@ai-devs-4/general": "*",
    "openai": "^4.0.0",
    "zod": "^3.0.0"
  }
}
```

Also create `lessons/S01E01/tsconfig.json` extending the root tsconfig if it exists, otherwise minimal:
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist"
  },
  "include": ["index.ts"]
}
```

### 9. Run and verify

```bash
cd /home/user/ai-devs-4
npm install
npx ts-node --esm lessons/S01E01/index.ts
```

Expected output: Hub returns `{FLG:...}` in `result.message`.

## Notes

- Check the actual CSV delimiter (could be `;` or `,`) by logging the first raw line before parsing.
- The `born` field must be an integer (year only), not a full date string — parse accordingly.
- Log each step (fetch, filter count, tagging input/output, final payload) for debugging.
- If the CSV contains headers in the first row, skip them during parsing.
- Do NOT commit `.env` or any API keys.
