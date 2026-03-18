import { fileURLToPath } from 'url';
import { config, resilientFetch, ask } from '@ai-devs-4/general';

export const TASK = 'failure';

const LOG_URL = `https://hub.ag3nts.org/data/${config.AIDEVS_API_KEY}/failure.log`;
const HUB_URL = 'https://hub.ag3nts.org/verify';

const SEVERITY_PATTERN = /\[(CRIT|ERRO|WARN)\]/i;

const MAX_ITERATIONS = 5;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

interface HubFeedback {
  code: number;
  message: string;
  tokenCount?: number;
  lineCount?: number;
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

export async function compressLogs(lines: string[]): Promise<string> {
  const joined = lines.join('\n');
  const tokens = estimateTokens(joined);
  console.log(`[s02e03] Pre-compression: ${lines.length} lines, ~${tokens} tokens`);

  if (tokens <= 1400) {
    console.log('[s02e03] Already within token budget — skipping LLM compression');
    return joined;
  }

  console.log('[s02e03] Compressing via LLM...');
  const compressed = await ask(
    `Compress these power plant log entries to fit within 1400 tokens. Rules:\n` +
    `- One line per event, format: [YYYY-MM-DD HH:MM] [LEVEL] SUBSYSTEM_ID brief description\n` +
    `- Preserve ALL timestamps, severity levels ([CRIT]/[WARN]/[ERRO]), and ALL subsystem IDs exactly as they appear (e.g. WTRPMP, ECCS, PWR01, WTANK, etc.)\n` +
    `- Every unique subsystem ID in the input MUST appear at least once in the output\n` +
    `- Shorten descriptions to essential meaning — remove verbose details\n` +
    `- Group repeated similar events — keep first occurrence and most severe\n` +
    `- Prioritize: CRIT > ERRO > WARN\n` +
    `- Output ONLY the compressed log lines, nothing else\n\n` +
    `Log entries:\n${joined}`,
    {
      model: 'gpt-4o-mini',
      temperature: 0,
      systemPrompt: 'You are a power plant log analyst. Output only compressed log lines, no commentary.',
    },
  );

  console.log(`[s02e03] Post-compression: ~${estimateTokens(compressed)} tokens`);
  return compressed;
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

function trimToTokenBudget(text: string, budget: number): string {
  const lines = text.split('\n');
  while (estimateTokens(lines.join('\n')) > budget && lines.length > 0) {
    const warnIdx = lines.findLastIndex((l) => l.includes('[WARN]'));
    if (warnIdx >= 0) {
      lines.splice(warnIdx, 1);
    } else {
      lines.pop();
    }
  }
  return lines.join('\n');
}

export async function run(): Promise<string> {
  // Step 1: Download
  const rawLog = await downloadLog();

  // Step 2: Filter by severity (no keyword filter — keep all WARN/ERRO/CRIT)
  const sevLines = filterBySeverity(rawLog);

  // Step 3: Compress
  let condensed = await compressLogs(sevLines);
  condensed = trimToTokenBudget(condensed, 1400);
  console.log(`[s02e03] Final token estimate: ~${estimateTokens(condensed)}`);

  // Step 4: Submit and iterate
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    console.log(`[s02e03] Submission attempt ${i + 1}/${MAX_ITERATIONS}`);
    const result = await submitToHub(condensed);

    const flagMatch = result.message.match(/\{FLG:[^}]+\}/);
    if (flagMatch) {
      console.log(`[s02e03] Flag found: ${flagMatch[0]}`);
      return result.message;
    }

    // Parse feedback and enhance logs
    console.log(`[s02e03] No flag — feedback: ${result.message}`);
    console.log(`[s02e03] Enhancing based on feedback...`);

    const enhanced = await ask(
      `The power plant log analysis system returned this feedback:\n"${result.message}"\n\n` +
      `Current condensed logs:\n${condensed}\n\n` +
      `Full severity-filtered log entries (all WARN/ERRO/CRIT from the original file):\n${sevLines.join('\n')}\n\n` +
      `Based on the feedback, produce an improved condensed log. Rules:\n` +
      `- One line per event: [YYYY-MM-DD HH:MM] [LEVEL] SUBSYSTEM_ID brief description\n` +
      `- The feedback says which subsystems are missing — find their entries in the full log and ADD them\n` +
      `- Preserve ALL subsystem IDs exactly as they appear in the original logs\n` +
      `- Keep total under 1400 tokens\n` +
      `- Prioritize CRIT > ERRO > WARN\n` +
      `- Output ONLY the log lines, nothing else`,
      {
        model: 'gpt-4o-mini',
        temperature: 0,
        systemPrompt: 'You are a power plant log analyst. Output only compressed log lines, no commentary.',
      },
    );

    condensed = trimToTokenBudget(enhanced, 1400);
    console.log(`[s02e03] Enhanced logs: ~${estimateTokens(condensed)} tokens, ${condensed.split('\n').length} lines`);
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
