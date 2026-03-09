import cors from 'cors';
import express from 'express';
import { z } from 'zod';
import { config, openai } from '@ai-devs-4/general';

const app = express();
const PORT = 3001;
const HUB_URL = 'https://hub.ag3nts.org';

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

app.get('/api/hub/health', async (_req, res): Promise<void> => {
  const start = Date.now();
  try {
    const upstream = await fetch(`${HUB_URL}/`, { signal: AbortSignal.timeout(5000) });
    const status = upstream.ok || upstream.status < 500 ? 'online' : 'offline';
    res.json({ status, latency: Date.now() - start });
  } catch {
    res.json({ status: 'offline', latency: Date.now() - start });
  }
});

app.get('/api/openai/health', async (_req, res): Promise<void> => {
  const start = Date.now();
  try {
    await openai.models.list();
    res.json({ status: 'online', latency: Date.now() - start });
  } catch {
    res.json({ status: 'offline', latency: Date.now() - start });
  }
});

app.get('/api/anthropic/health', async (_req, res): Promise<void> => {
  const start = Date.now();
  try {
    const response = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': config.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(5000),
    });
    const status = response.ok ? 'online' : 'offline';
    res.json({ status, latency: Date.now() - start });
  } catch {
    res.json({ status: 'offline', latency: Date.now() - start });
  }
});

app.post('/api/hub/verify', async (req, res): Promise<void> => {
  const { task, answer } = req.body as { task: string; answer: unknown };

  const body = {
    apikey: config.AIDEVS_API_KEY,
    task,
    answer,
  };

  console.log(`[backend] Proxying Hub API request for task: ${task}`);

  const upstream = await fetch(`${HUB_URL}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data: unknown = await upstream.json();
  res.status(upstream.status).json(data);
});

// ─── S01E01: People Filter & Tagging ───────────────────────────────────────

const S01E01_TASK = 'people';
const S01E01_BIRTH_YEAR_MIN = 1986;
const S01E01_BIRTH_YEAR_MAX = 2006;
const S01E01_TARGET_CITY = 'Grudziądz';
const S01E01_TARGET_GENDER = 'M';
const S01E01_TARGET_TAG = 'transport';
const S01E01_MODEL = 'gpt-4o-mini';

const S01E01_AVAILABLE_TAGS = [
  'IT',
  'transport',
  'edukacja',
  'medycyna',
  'praca z ludźmi',
  'praca z pojazdami',
  'praca fizyczna',
] as const;

type S01E01Tag = (typeof S01E01_AVAILABLE_TAGS)[number];

const S01E01PersonRowSchema = z.object({
  name: z.string().min(1),
  surname: z.string().min(1),
  gender: z.string().min(1),
  born: z.number().int(),
  city: z.string().min(1),
  job: z.string().min(1),
});

type S01E01PersonRow = z.infer<typeof S01E01PersonRowSchema>;

const S01E01TaggingResponseSchema = z.object({
  results: z.array(
    z.object({
      index: z.number().int(),
      tags: z.array(z.enum(S01E01_AVAILABLE_TAGS)),
    }),
  ),
});

interface S01E01PersonAnswer {
  name: string;
  surname: string;
  gender: string;
  born: number;
  city: string;
  tags: S01E01Tag[];
}

interface S01E01LogEntry {
  message: string;
  level: 'info' | 'success' | 'warn' | 'error';
}

interface S01E01RunResponse {
  steps: S01E01LogEntry[];
  flag?: string;
}

function s01e01ParseCsv(text: string): S01E01PersonRow[] {
  const lines = text.trim().split('\n');
  const firstLine = lines[0] ?? '';
  const delimiter = firstLine.includes(';') ? ';' : ',';

  const people: S01E01PersonRow[] = [];
  for (const line of lines.slice(1)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(delimiter).map(f => f.trim());
    const [name, surname, gender, bornRaw, city, ...jobParts] = parts;
    const born = bornRaw !== undefined ? parseInt(bornRaw.substring(0, 4), 10) : NaN;
    const row = S01E01PersonRowSchema.safeParse({ name, surname, gender, born, city, job: jobParts.join(delimiter) });
    if (row.success) people.push(row.data);
  }
  return people;
}

app.post('/api/lessons/s01e01/run', async (_req, res): Promise<void> => {
  const steps: S01E01LogEntry[] = [];
  const log = (message: string, level: S01E01LogEntry['level'] = 'info'): void => {
    steps.push({ message, level });
    console.log(`[s01e01/${level}] ${message}`);
  };

  try {
    // Step 1: Fetch CSV
    log('Fetching people.csv from Hub API...');
    const csvUrl = `${HUB_URL}/data/${config.AIDEVS_API_KEY}/people.csv`;
    const csvRes = await fetch(csvUrl);
    if (!csvRes.ok) throw new Error(`CSV fetch failed: HTTP ${csvRes.status}`);
    const csvText = await csvRes.text();
    const firstLine = csvText.split('\n')[0] ?? '';
    const delimiter = firstLine.includes(';') ? ';' : ',';
    log(`CSV fetched — detected delimiter: "${delimiter}"`);

    // Step 2: Parse & filter
    const allPeople = s01e01ParseCsv(csvText);
    log(`Parsed ${allPeople.length} records from CSV`);

    const filtered = allPeople.filter(
      p =>
        p.gender === S01E01_TARGET_GENDER &&
        p.city === S01E01_TARGET_CITY &&
        p.born >= S01E01_BIRTH_YEAR_MIN &&
        p.born <= S01E01_BIRTH_YEAR_MAX,
    );
    log(`After filter: ${filtered.length} people (M, ${S01E01_TARGET_CITY}, born ${S01E01_BIRTH_YEAR_MIN}–${S01E01_BIRTH_YEAR_MAX})`);

    if (filtered.length === 0) {
      log('No people matched filter criteria — aborting', 'warn');
      const response: S01E01RunResponse = { steps };
      res.json(response);
      return;
    }

    // Step 3: Tag professions
    log(`Tagging ${filtered.length} professions via ${S01E01_MODEL}...`);
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
      model: S01E01_MODEL,
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
                      items: { type: 'string', enum: [...S01E01_AVAILABLE_TAGS] },
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

    const tagData = S01E01TaggingResponseSchema.parse(JSON.parse(content));
    log(`Received tags for ${tagData.results.length} professions`);

    // Step 4: Filter by transport tag
    const tagMap = new Map<number, S01E01Tag[]>();
    for (const { index, tags } of tagData.results) tagMap.set(index, tags);

    const transportPeople: S01E01PersonAnswer[] = [];
    for (const [i, person] of filtered.entries()) {
      const tags = tagMap.get(i) ?? [];
      if (tags.includes(S01E01_TARGET_TAG)) {
        transportPeople.push({ name: person.name, surname: person.surname, gender: person.gender, born: person.born, city: person.city, tags });
      }
    }
    log(`${transportPeople.length} people have the '${S01E01_TARGET_TAG}' tag`);

    // Step 5: Submit to Hub API
    log(`Submitting answer to Hub API (task: ${S01E01_TASK})...`);
    const hubBody = { apikey: config.AIDEVS_API_KEY, task: S01E01_TASK, answer: transportPeople };
    const hubRes = await fetch(`${HUB_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(hubBody),
    });
    const hubData = (await hubRes.json()) as { code: number; message: string };
    log(`Hub API response: ${hubData.message}`, hubData.code === 0 ? 'success' : 'warn');

    const response: S01E01RunResponse = { steps, flag: hubData.message };
    res.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Error: ${message}`, 'error');
    const response: S01E01RunResponse = { steps };
    res.status(500).json(response);
  }
});

app.listen(PORT, () => {
  console.log(`[backend] Server running at http://localhost:${PORT}`);
});
