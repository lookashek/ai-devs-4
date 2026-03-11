import { Router } from 'express';
import { z } from 'zod';
import { config, openai, saveToStore } from '@ai-devs-4/general';

const HUB_URL = 'https://hub.ag3nts.org';
const TASK = 'people';
const BIRTH_YEAR_MIN = 1986;
const BIRTH_YEAR_MAX = 2006;
const TARGET_CITY = 'Grudziądz';
const TARGET_GENDER = 'M';
const TARGET_TAG = 'transport';
const MODEL = 'gpt-4o-mini';

const AVAILABLE_TAGS = [
  'IT',
  'transport',
  'edukacja',
  'medycyna',
  'praca z ludźmi',
  'praca z pojazdami',
  'praca fizyczna',
] as const;

type Tag = (typeof AVAILABLE_TAGS)[number];

const PersonRowSchema = z.object({
  name: z.string().min(1),
  surname: z.string().min(1),
  gender: z.string().min(1),
  born: z.number().int(),
  city: z.string().min(1),
  job: z.string().min(1),
});

type PersonRow = z.infer<typeof PersonRowSchema>;

const TaggingResponseSchema = z.object({
  results: z.array(
    z.object({
      index: z.number().int(),
      tags: z.array(z.enum(AVAILABLE_TAGS)),
    }),
  ),
});

interface PersonAnswer {
  name: string;
  surname: string;
  gender: string;
  born: number;
  city: string;
  tags: Tag[];
}

interface LogEntry {
  message: string;
  level: 'info' | 'success' | 'warn' | 'error';
}

export interface RunResponse {
  steps: LogEntry[];
  flag?: string;
}

function parseCsv(text: string): PersonRow[] {
  const lines = text.trim().split('\n');
  const firstLine = lines[0] ?? '';
  const delimiter = firstLine.includes(';') ? ';' : ',';

  const people: PersonRow[] = [];
  for (const line of lines.slice(1)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(delimiter).map(f => f.trim());
    const [name, surname, gender, bornRaw, city, ...jobParts] = parts;
    const born = bornRaw !== undefined ? parseInt(bornRaw.substring(0, 4), 10) : NaN;
    const row = PersonRowSchema.safeParse({ name, surname, gender, born, city, job: jobParts.join(delimiter) });
    if (row.success) people.push(row.data);
  }
  return people;
}

export const s01e01Router = Router();

s01e01Router.post('/run', async (_req, res): Promise<void> => {
  const steps: LogEntry[] = [];
  const log = (message: string, level: LogEntry['level'] = 'info'): void => {
    steps.push({ message, level });
    console.log(`[s01e01/${level}] ${message}`);
  };

  try {
    // Step 1: Fetch CSV
    log('Fetching people.csv from Hub API...');
    const csvRes = await fetch(`${HUB_URL}/data/${config.AIDEVS_API_KEY}/people.csv`);
    if (!csvRes.ok) throw new Error(`CSV fetch failed: HTTP ${csvRes.status}`);
    const csvText = await csvRes.text();
    const firstLine = csvText.split('\n')[0] ?? '';
    const delimiter = firstLine.includes(';') ? ';' : ',';
    log(`CSV fetched — detected delimiter: "${delimiter}"`);

    // Step 2: Parse & filter
    const allPeople = parseCsv(csvText);
    log(`Parsed ${allPeople.length} records from CSV`);

    const filtered = allPeople.filter(
      p =>
        p.gender === TARGET_GENDER &&
        p.city === TARGET_CITY &&
        p.born >= BIRTH_YEAR_MIN &&
        p.born <= BIRTH_YEAR_MAX,
    );
    log(`After filter: ${filtered.length} people (M, ${TARGET_CITY}, born ${BIRTH_YEAR_MIN}–${BIRTH_YEAR_MAX})`);

    if (filtered.length === 0) {
      log('No people matched filter criteria — aborting', 'warn');
      res.json({ steps } satisfies RunResponse);
      return;
    }

    // Step 3: Tag professions (single batch call)
    log(`Tagging ${filtered.length} professions via ${MODEL}...`);
    const jobList = filtered.map((p, i) => `${i}: ${p.job}`).join('\n');

    const systemPrompt = `Jesteś ekspertem w klasyfikacji zawodów. Przypisz odpowiednie tagi do każdego zawodu.

Dostępne tagi i ich opisy:
- IT: praca z komputerami, oprogramowaniem, sieciami, elektroniką
- transport: praca z pojazdami, logistyka, przewóz osób/towarów, kierowcy, spedycja
- edukacja: nauczanie, szkolenia, wychowanie
- medycyna: opieka zdrowotna, leczenie, farmacja, ratownictwo
- praca z ludźmi: obsługa klienta, handel, HR, praca socjalna
- praca z pojazdami: mechanika, naprawa pojazdów, obsługa maszyn
- praca fizyczna: budownictwo, magazynowanie, rolnictwo, rzemiosło

Zwróć JSON z tablicą wyników dla każdego indeksu.`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const llmResponse = await (openai.chat.completions.create as any)({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Przypisz tagi do poniższych zawodów:\n\n${jobList}` },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'tagging_response',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              results: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    index: { type: 'integer' },
                    tags: {
                      type: 'array',
                      items: { type: 'string', enum: [...AVAILABLE_TAGS] },
                    },
                  },
                  required: ['index', 'tags'],
                  additionalProperties: false,
                },
              },
            },
            required: ['results'],
            additionalProperties: false,
          },
        },
      },
    });

    const content = (llmResponse as { choices: Array<{ message: { content: string | null } }> })
      .choices[0]?.message?.content;
    if (!content) throw new Error('Empty OpenAI response');

    const tagData = TaggingResponseSchema.parse(JSON.parse(content));
    log(`Received tags for ${tagData.results.length} professions`);

    // Step 4: Filter by transport tag
    const tagMap = new Map<number, Tag[]>();
    for (const { index, tags } of tagData.results) tagMap.set(index, tags);

    const transportPeople: PersonAnswer[] = [];
    for (const [i, person] of filtered.entries()) {
      const tags = tagMap.get(i) ?? [];
      if (tags.includes(TARGET_TAG)) {
        transportPeople.push({ name: person.name, surname: person.surname, gender: person.gender, born: person.born, city: person.city, tags });
      }
    }
    log(`${transportPeople.length} people have the '${TARGET_TAG}' tag`);

    // Save suspects for S01E02
    saveToStore('s01e01_suspects', transportPeople);
    log(`Saved ${transportPeople.length} suspects to data store`);

    // Step 5: Submit to Hub API
    log(`Submitting answer to Hub API (task: ${TASK})...`);
    const hubRes = await fetch(`${HUB_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apikey: config.AIDEVS_API_KEY, task: TASK, answer: transportPeople }),
    });
    const hubData = (await hubRes.json()) as { code: number; message: string };
    log(`Hub API response: ${hubData.message}`, hubData.code === 0 ? 'success' : 'warn');

    res.json({ steps, flag: hubData.message } satisfies RunResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Error: ${message}`, 'error');
    res.status(500).json({ steps } satisfies RunResponse);
  }
});
