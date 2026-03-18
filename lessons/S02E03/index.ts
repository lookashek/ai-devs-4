import { fileURLToPath } from 'url';
import { config, resilientFetch, ask } from '@ai-devs-4/general';

export const TASK = 'failure';

const LOG_URL = `https://hub.ag3nts.org/data/${config.AIDEVS_API_KEY}/failure.log`;
const HUB_URL = 'https://hub.ag3nts.org/verify';

const SEVERITY_PATTERN = /\[(CRIT|ERRO|WARN)\]/;
const TIMESTAMP_PATTERN = /\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}/;
const MAX_ITERATIONS = 5;

interface HubFeedback {
  code: number;
  message: string;
  tokenCount?: number;
  lineCount?: number;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/** Strip markdown fences and non-log lines */
function sanitizeLlmOutput(text: string): string {
  return text
    .replace(/```[\w]*\n?/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && TIMESTAMP_PATTERN.test(l))
    .join('\n');
}

/** Sort lines by full timestamp including seconds */
function sortChronologically(text: string): string {
  return text
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .sort((a, b) => {
      const tA = a.match(/\[(\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}(?::\d{2})?)\]/)?.[1] ?? '';
      const tB = b.match(/\[(\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}(?::\d{2})?)\]/)?.[1] ?? '';
      return tA.localeCompare(tB);
    })
    .join('\n');
}

/** Extract all-caps subsystem IDs (like ECCS8, PWR01, WTRPMP) from log lines */
function extractSubsystemIds(lines: string[]): string[] {
  const ids = new Set<string>();
  for (const line of lines) {
    // Match uppercase alphanumeric codes (2+ chars, at least one letter) that look like subsystem IDs
    const matches = line.matchAll(/\b([A-Z][A-Z0-9]{2,})\b/g);
    for (const m of matches) {
      const id = m[1]!;
      // Exclude severity levels and common words
      if (!['CRIT', 'ERRO', 'WARN', 'INFO', 'DEBUG', 'ERROR', 'WARNING', 'CRITICAL'].includes(id)) {
        ids.add(id);
      }
    }
  }
  return [...ids].sort();
}

const SEVERITY_RANK: Record<string, number> = { CRIT: 3, ERRO: 2, WARN: 1 };

/** Trim by removing WARN then ERRO lines until under budget */
function trimToTokenBudget(text: string, budget: number): string {
  const lines = [...new Set(text.split('\n').filter((l) => l.trim().length > 0))];

  while (estimateTokens(lines.join('\n')) > budget && lines.length > 0) {
    const warnIdx = lines.findLastIndex((l) => l.includes('[WARN]'));
    if (warnIdx >= 0) {
      lines.splice(warnIdx, 1);
    } else {
      const erroIdx = lines.findLastIndex((l) => l.includes('[ERRO]'));
      if (erroIdx >= 0) {
        lines.splice(erroIdx, 1);
      } else {
        lines.pop();
      }
    }
  }
  return lines.join('\n');
}

export async function downloadLog(): Promise<string> {
  const response = await resilientFetch(LOG_URL, { method: 'GET' });
  const text = await response.text();
  console.log(`[s02e03] Downloaded log: ${text.length} chars, ~${text.split('\n').length} lines`);
  return text;
}

export function filterBySeverity(rawLog: string): string[] {
  const lines = rawLog.split('\n').filter((l) => l.trim().length > 0);
  const filtered = lines.filter((line) => SEVERITY_PATTERN.test(line));
  console.log(`[s02e03] Severity filter: ${lines.length} → ${filtered.length} lines`);
  return filtered;
}

async function submitToHub(logs: string): Promise<HubFeedback> {
  const body = {
    apikey: config.AIDEVS_API_KEY,
    task: TASK,
    answer: { logs },
  };

  const res = await fetch(HUB_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as HubFeedback;
  console.log(`[s02e03] Hub response (${res.status}):`, JSON.stringify(data));
  return data;
}

export async function run(): Promise<string> {
  // Step 1: Download & filter
  const rawLog = await downloadLog();
  const sevLines = filterBySeverity(rawLog);

  // Step 2: Extract real subsystem IDs
  const subsystemIds = extractSubsystemIds(sevLines);
  console.log(`[s02e03] Found ${subsystemIds.length} subsystem IDs: ${subsystemIds.join(', ')}`);

  // Step 3: Log a few sample lines so we can see the format
  console.log(`[s02e03] Sample CRIT lines:`);
  sevLines.filter((l) => l.includes('[CRIT]')).slice(0, 3).forEach((l) => console.log(`  ${l.substring(0, 150)}`));

  // Step 4: LLM compression — single pass, strict constraints
  // Hub token limit is 1500; our char estimator undercounts by ~1.6x
  // So target ~25 lines with short descriptions
  const compressed = await ask(
    `You are analyzing power plant failure logs. Compress them into an incident timeline.\n\n` +
    `RULES:\n` +
    `- Keep the EXACT original format of each line — do not reformat timestamps or severity tags\n` +
    `- Pick only the most critical event per subsystem (${subsystemIds.join(', ')})\n` +
    `- Every subsystem ID above MUST appear at least once\n` +
    `- Strict chronological order\n` +
    `- Shorten long descriptions to max 10 words but keep subsystem IDs intact\n` +
    `- Output ONLY log lines — no markdown, no fences, no commentary\n` +
    `- Maximum 25 output lines total\n\n` +
    `LOG:\n${sevLines.join('\n')}`,
    {
      model: 'gpt-4o-mini',
      temperature: 0,
      systemPrompt: 'Output only log lines. No markdown. No code fences. No commentary.',
    },
  );

  let condensed = sanitizeLlmOutput(compressed);
  condensed = sortChronologically(condensed);
  console.log(`[s02e03] LLM compressed: ~${estimateTokens(condensed)} tokens, ${condensed.split('\n').length} lines`);

  // Step 5: Verify all subsystem IDs present; patch from original data if missing
  const missingIds = subsystemIds.filter((id) => !condensed.includes(id));
  if (missingIds.length > 0) {
    console.log(`[s02e03] Patching ${missingIds.length} missing IDs: ${missingIds.join(', ')}`);
    for (const id of missingIds) {
      // Find the most severe line mentioning this subsystem
      const matching = sevLines.filter((l) => l.includes(id));
      if (matching.length > 0) {
        const best = matching.sort((a, b) =>
          (SEVERITY_RANK[b.match(/\[(CRIT|ERRO|WARN)\]/)?.[1] ?? 'WARN'] ?? 0)
          - (SEVERITY_RANK[a.match(/\[(CRIT|ERRO|WARN)\]/)?.[1] ?? 'WARN'] ?? 0)
        )[0]!;
        condensed += '\n' + best;
      }
    }
    condensed = sortChronologically(condensed);
  }

  // Step 6: Trim to budget (target ~900 est tokens ≈ 1440 Hub tokens)
  condensed = trimToTokenBudget(condensed, 900);
  console.log(`[s02e03] Final: ~${estimateTokens(condensed)} tokens, ${condensed.split('\n').length} lines`);

  // Step 7: Submit and iterate on feedback
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    console.log(`[s02e03] Submission attempt ${i + 1}/${MAX_ITERATIONS}`);
    const result = await submitToHub(condensed);

    const flagMatch = result.message.match(/\{FLG:[^}]+\}/);
    if (flagMatch) {
      console.log(`[s02e03] Flag found: ${flagMatch[0]}`);
      return result.message;
    }

    console.log(`[s02e03] No flag — feedback: ${result.message}`);

    // Handle "what happened to X" — missing/insufficient subsystem info
    // Extract the subsystem ID (ALL-CAPS code) from feedback
    const feedbackIds = [...result.message.matchAll(/\b([A-Z][A-Z0-9]{2,})\b/g)]
      .map((m) => m[1]!)
      .filter((id) => !['CRIT', 'ERRO', 'WARN', 'INFO'].includes(id));
    const missingSubId = feedbackIds[0];

    if (missingSubId) {
      console.log(`[s02e03] Enriching subsystem: ${missingSubId}`);
      // Remove existing lines for this subsystem (they were insufficient)
      const existingLines = condensed.split('\n');
      const withoutSub = existingLines.filter((l) => !l.includes(missingSubId));
      // Add ALL severity lines for this subsystem (uncompressed, full detail)
      const subLines = sevLines.filter((l) => l.includes(missingSubId));
      console.log(`[s02e03] Found ${subLines.length} severity lines for ${missingSubId}`);
      if (subLines.length > 0) {
        // Take top 5 most severe, unmodified
        const top = subLines.sort((a, b) =>
          (SEVERITY_RANK[b.match(/\[(CRIT|ERRO|WARN)\]/)?.[1] ?? 'WARN'] ?? 0)
          - (SEVERITY_RANK[a.match(/\[(CRIT|ERRO|WARN)\]/)?.[1] ?? 'WARN'] ?? 0)
        ).slice(0, 5);
        condensed = [...withoutSub, ...top].join('\n');
      } else {
        // Search ALL lines including INFO
        const allMatch = rawLog.split('\n').filter((l) => l.trim() && l.includes(missingSubId));
        console.log(`[s02e03] Found ${allMatch.length} total lines for ${missingSubId}`);
        condensed = [...withoutSub, ...allMatch.slice(0, 5)].join('\n');
      }
      condensed = sortChronologically(condensed);
      condensed = trimToTokenBudget(condensed, 900);
    } else if (result.message.includes('chronological order')) {
      condensed = sortChronologically(condensed);
    } else if (result.message.includes('compression') || result.message.includes('context window')) {
      const hubTokens = result.tokenCount ?? 2000;
      const ratio = hubTokens / Math.max(estimateTokens(condensed), 1);
      const targetEst = Math.floor(1400 / ratio);
      console.log(`[s02e03] Hub tokens: ${hubTokens}, ratio: ${ratio.toFixed(2)}, target est: ${targetEst}`);
      condensed = trimToTokenBudget(condensed, targetEst);
    } else if (result.message.includes('time marker')) {
      // Bad line format — re-sanitize
      condensed = sanitizeLlmOutput(condensed);
      condensed = sortChronologically(condensed);
    }

    console.log(`[s02e03] Updated: ~${estimateTokens(condensed)} tokens, ${condensed.split('\n').length} lines`);
  }

  return 'Max iterations reached without flag';
}

async function main(): Promise<void> {
  const result = await run();
  console.log(`[s02e03] Result: ${result}`);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error('[s02e03] Fatal error:', err);
    process.exit(1);
  });
}
