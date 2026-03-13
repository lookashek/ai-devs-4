import { fileURLToPath } from 'url';
import { readFile } from 'fs/promises';
import { join, resolve } from 'path';
import { z } from 'zod';
import {
  config,
  submitAnswer,
  fetchText,
  fetchAndFollowLinks,
  imageToText,
  ask,
} from '@ai-devs-4/general';
import type { DownloadedFile } from '@ai-devs-4/general';

export const TASK = 'sendit';

const DOC_BASE_URL = 'https://hub.ag3nts.org/dane/doc/';
const DOC_INDEX = 'index.md';

const DOCS_DIR = resolve(
  fileURLToPath(import.meta.url),
  '..',
  'docs',
);

// Task parameters (given by the course)
const SENDER_ID = '450202122';
const ORIGIN = 'Gdańsk';
const DESTINATION = 'Żarnowiec';
const WEIGHT_KG = 2800;
const CONTENTS_DESCRIPTION_PL = 'kasety z paliwem reaktorowym';

// Schema for LLM-extracted declaration data
const DeclarationDataSchema = z.object({
  routeCode: z.string().describe('Route code for the origin-destination pair, e.g. X-01'),
  category: z.string().length(1).describe('Package category letter: A, B, C, D, or E'),
  wdp: z.number().int().min(0).describe('Number of additional wagons (WDP)'),
  fee: z.number().min(0).describe('Total fee in PP'),
  specialRemarks: z.string().describe('Special remarks, or BRAK if none'),
});

type DeclarationData = z.infer<typeof DeclarationDataSchema>;

export interface LogEntry {
  message: string;
  level: 'info' | 'success' | 'warn' | 'error';
}

export type LogFn = (message: string, level?: LogEntry['level']) => void;

/**
 * Step 1: Fetch all SPK documentation files (index + linked attachments).
 */
async function fetchAllDocs(log: LogFn): Promise<DownloadedFile[]> {
  log('Fetching SPK documentation from Hub...');

  const files = await fetchAndFollowLinks(DOC_BASE_URL, DOC_INDEX, DOCS_DIR);

  // The index uses [include file="..."] syntax which fetchAndFollowLinks may not parse.
  // Manually check for include directives and fetch missing files.
  const indexContent = await readFile(join(DOCS_DIR, DOC_INDEX), 'utf-8');
  const includePattern = /\[include file="([^"]+)"\]/g;
  const existingUrls = new Set(files.map(f => f.url));

  let match: RegExpExecArray | null;
  while ((match = includePattern.exec(indexContent)) !== null) {
    const filename = match[1];
    const fileUrl = DOC_BASE_URL + filename;
    if (!existingUrls.has(fileUrl)) {
      log(`Fetching included file: ${filename}`);
      try {
        const { downloadFile } = await import('@ai-devs-4/general');
        const localPath = join(DOCS_DIR, filename);
        const isImage = /\.(png|jpg|jpeg|webp|gif|bmp|svg)$/i.test(filename);
        await downloadFile(fileUrl, localPath);
        files.push({ url: fileUrl, localPath: resolve(localPath), type: isImage ? 'image' : 'text' });
      } catch (err) {
        log(`Failed to fetch ${filename}: ${err}`, 'warn');
      }
    }
  }

  log(`Downloaded ${files.length} documentation files`, 'success');
  return files;
}

/**
 * Step 2: Read all text files and extract text from images via vision.
 */
async function readAllDocContents(files: DownloadedFile[], log: LogFn): Promise<string> {
  const sections: string[] = [];

  for (const file of files) {
    const filename = file.localPath.split('/').pop() ?? file.localPath;

    if (file.type === 'image') {
      log(`Processing image with vision: ${filename}`);
      try {
        const extractedText = await imageToText(
          file.localPath,
          'Extract ALL text, data, tables, and information visible in this image. Return it as structured text preserving the table format. Use markdown table syntax if appropriate.',
        );
        sections.push(`\n--- Image: ${filename} ---\n${extractedText}`);
      } catch (err) {
        log(`Failed to process image ${filename}: ${err}`, 'warn');
      }
    } else {
      try {
        const content = await readFile(file.localPath, 'utf-8');
        sections.push(`\n--- File: ${filename} ---\n${content}`);
      } catch (err) {
        log(`Failed to read ${filename}: ${err}`, 'warn');
      }
    }
  }

  return sections.join('\n');
}

/**
 * Step 3: Use LLM to analyze the docs and extract declaration parameters.
 */
async function analyzeDocsAndExtractData(
  allDocsContent: string,
  log: LogFn,
): Promise<DeclarationData> {
  log('Analyzing documentation with LLM to extract declaration data...');

  const prompt = `You are analyzing SPK (System Przesyłek Konduktorskich) documentation to fill out a transport declaration.

The shipment details:
- Sender ID: ${SENDER_ID}
- Origin: ${ORIGIN}
- Destination: ${DESTINATION}
- Weight: ${WEIGHT_KG} kg
- Contents: ${CONTENTS_DESCRIPTION_PL} (reactor fuel cassettes)
- Budget: 0 PP (must find a category where the System covers the cost)
- No special remarks should be added

Based on the documentation below, determine:

1. **routeCode**: The route code for ${ORIGIN} → ${DESTINATION}. Check both active routes and excluded/blocked routes (trasy wyłączone). The route may be blocked but still usable for certain categories.

2. **category**: The package category (A/B/C/D/E) that:
   - Best fits reactor fuel cassettes as contents
   - Is financed by the System (0 PP cost)
   - Is allowed to use blocked/excluded routes (if the route is blocked)

3. **wdp**: Number of additional wagons needed. Standard train has 2 wagons × 500 kg = 1000 kg capacity. Calculate how many extra 500 kg wagons are needed for ${WEIGHT_KG} kg. Use: ceil((${WEIGHT_KG} - 1000) / 500).

4. **fee**: Total fee in PP. Consider:
   - Base fee for the chosen category
   - Weight fee
   - Route fee
   - Extra wagon fee
   - Any exemptions for the chosen category (Sections 9.2-9.4)

5. **specialRemarks**: Should be "BRAK" (none) as specified.

Return your answer as a JSON object with these exact keys: routeCode, category, wdp, fee, specialRemarks.
Return ONLY the JSON, no explanation.

DOCUMENTATION:
${allDocsContent}`;

  const response = await ask(prompt, { temperature: 0, maxTokens: 500 });
  log(`LLM raw response: ${response}`);

  // Extract JSON from response (may be wrapped in markdown code block)
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`LLM did not return valid JSON: ${response}`);
  }

  const parsed = JSON.parse(jsonMatch[0]) as unknown;
  const data = DeclarationDataSchema.parse(parsed);

  log(`Route code: ${data.routeCode}`, 'info');
  log(`Category: ${data.category}`, 'info');
  log(`WDP: ${data.wdp} additional wagons`, 'info');
  log(`Fee: ${data.fee} PP`, 'info');
  log(`Remarks: ${data.specialRemarks}`, 'info');

  return data;
}

/**
 * Step 4: Build the declaration string from the template.
 */
function buildDeclaration(data: DeclarationData): string {
  const today = new Date().toISOString().split('T')[0];

  return `SYSTEM PRZESYŁEK KONDUKTORSKICH - DEKLARACJA ZAWARTOŚCI
======================================================
DATA: ${today}
PUNKT NADAWCZY: ${ORIGIN}
------------------------------------------------------
NADAWCA: ${SENDER_ID}
PUNKT DOCELOWY: ${DESTINATION}
TRASA: ${data.routeCode}
------------------------------------------------------
KATEGORIA PRZESYŁKI: ${data.category}
------------------------------------------------------
OPIS ZAWARTOŚCI (max 200 znaków): ${CONTENTS_DESCRIPTION_PL}
------------------------------------------------------
DEKLAROWANA MASA (kg): ${WEIGHT_KG}
------------------------------------------------------
WDP: ${data.wdp}
------------------------------------------------------
UWAGI SPECJALNE: ${data.specialRemarks}
------------------------------------------------------
KWOTA DO ZAPŁATY: ${data.fee} PP
------------------------------------------------------
OŚWIADCZAM, ŻE PODANE INFORMACJE SĄ PRAWDZIWE.
BIORĘ NA SIEBIE KONSEKWENCJĘ ZA FAŁSZYWE OŚWIADCZENIE.
======================================================`;
}

/**
 * Full pipeline: fetch docs → process images → analyze → build declaration → submit.
 */
export async function run(log?: LogFn): Promise<{ steps: LogEntry[]; declaration: string; flag?: string }> {
  const steps: LogEntry[] = [];
  const _log: LogFn = log ?? ((message, level = 'info') => {
    steps.push({ message, level });
    console.log(`[s01e04/${level}] ${message}`);
  });

  _log('Starting S01E04 — Transport Declaration task');

  // 1. Fetch all documentation
  const files = await fetchAllDocs(_log);

  // 2. Read text files and extract text from images
  const allDocsContent = await readAllDocContents(files, _log);
  _log(`Total documentation size: ${allDocsContent.length} characters`);

  // 3. Analyze with LLM to extract declaration fields
  const declarationData = await analyzeDocsAndExtractData(allDocsContent, _log);

  // 4. Build the declaration
  const declaration = buildDeclaration(declarationData);
  _log('Final declaration:');
  _log(declaration);

  // 5. Submit to Hub API
  _log('Submitting declaration to Hub API...');
  const result = await submitAnswer({ task: TASK, answer: { declaration } });
  _log(`Hub response: ${result.message}`, result.message.includes('{FLG:') ? 'success' : 'warn');

  const flag = result.message.includes('{FLG:') ? result.message : undefined;
  return { steps, declaration, flag };
}

// CLI entry point
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  run().then(({ flag }) => {
    if (flag) console.log(`[s01e04] Flag: ${flag}`);
  }).catch(err => {
    console.error('[s01e04] Fatal error:', err);
    process.exit(1);
  });
}
