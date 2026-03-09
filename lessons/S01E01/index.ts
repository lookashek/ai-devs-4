import { z } from 'zod';
import { config, submitAnswer, openai } from '@ai-devs-4/general';

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

const TagSchema = z.enum(AVAILABLE_TAGS);

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
      tags: z.array(TagSchema),
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

function parseCsvLine(line: string, delimiter: string): string[] {
  return line.split(delimiter).map(field => field.trim());
}

function parseBornYear(raw: string): number {
  // Handle full dates like "1990-01-01" or plain years like "1990"
  return parseInt(raw.substring(0, 4), 10);
}

async function fetchPeopleCsv(): Promise<PersonRow[]> {
  const url = `https://hub.ag3nts.org/data/${config.AIDEVS_API_KEY}/people.csv`;
  console.log('[s01e01] Fetching CSV from Hub API...');

  const res = await fetch(url);
  if (!res.ok) throw new Error(`[s01e01] CSV fetch failed: HTTP ${res.status}`);

  const text = await res.text();
  const lines = text.trim().split('\n');

  const firstLine = lines[0] ?? '';
  console.log('[s01e01] First line (raw):', firstLine);

  const delimiter = firstLine.includes(';') ? ';' : ',';
  console.log('[s01e01] Detected delimiter:', JSON.stringify(delimiter));

  const people: PersonRow[] = [];
  // Skip header row (index 0)
  for (const line of lines.slice(1)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = parseCsvLine(trimmed, delimiter);
    const [name, surname, gender, bornRaw, city, ...jobParts] = parts;

    const row = PersonRowSchema.safeParse({
      name,
      surname,
      gender,
      born: bornRaw !== undefined ? parseBornYear(bornRaw) : NaN,
      city,
      job: jobParts.join(delimiter),
    });

    if (row.success) {
      people.push(row.data);
    } else {
      console.warn('[s01e01] Skipping invalid row:', trimmed);
    }
  }

  console.log(`[s01e01] Parsed ${people.length} people from CSV`);
  return people;
}

function filterPeople(people: PersonRow[]): PersonRow[] {
  const filtered = people.filter(
    p =>
      p.gender === TARGET_GENDER &&
      p.city === TARGET_CITY &&
      p.born >= BIRTH_YEAR_MIN &&
      p.born <= BIRTH_YEAR_MAX,
  );
  console.log(`[s01e01] After filter: ${filtered.length} people (M, ${TARGET_CITY}, born ${BIRTH_YEAR_MIN}–${BIRTH_YEAR_MAX})`);
  return filtered;
}

async function tagProfessions(people: PersonRow[]): Promise<Map<number, Tag[]>> {
  const jobList = people.map((p, i) => `${i}: ${p.job}`).join('\n');

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

  const userMessage = `Przypisz tagi do poniższych zawodów:\n\n${jobList}`;

  console.log(`[s01e01] Tagging ${people.length} professions via OpenAI (${MODEL})...`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (openai.chat.completions.create as any)({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
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
                    items: {
                      type: 'string',
                      enum: [...AVAILABLE_TAGS],
                    },
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

  const content = (response as { choices: Array<{ message: { content: string | null } }> })
    .choices[0]?.message?.content;
  if (!content) throw new Error('[s01e01] Empty OpenAI response');

  const parsed = TaggingResponseSchema.parse(JSON.parse(content));
  console.log(`[s01e01] Received tags for ${parsed.results.length} professions`);

  const tagMap = new Map<number, Tag[]>();
  for (const { index, tags } of parsed.results) {
    tagMap.set(index, tags);
  }
  return tagMap;
}

async function main(): Promise<void> {
  const allPeople = await fetchPeopleCsv();
  const filtered = filterPeople(allPeople);

  if (filtered.length === 0) {
    console.warn('[s01e01] No people match the filter — check CSV structure');
    return;
  }

  const tagMap = await tagProfessions(filtered);

  const transportPeople: PersonAnswer[] = [];
  for (const [i, person] of filtered.entries()) {
    const tags = tagMap.get(i) ?? [];
    if (tags.includes(TARGET_TAG)) {
      transportPeople.push({
        name: person.name,
        surname: person.surname,
        gender: person.gender,
        born: person.born,
        city: person.city,
        tags,
      });
    }
  }

  console.log(`[s01e01] ${transportPeople.length} people with '${TARGET_TAG}' tag:`, transportPeople);

  const result = await submitAnswer({ task: TASK, answer: transportPeople });
  console.log('[s01e01] Flag:', result.message);
}

main().catch(err => {
  console.error('[s01e01] Fatal error:', err);
  process.exit(1);
});
