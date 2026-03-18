import { fileURLToPath } from 'url';
import { config, resilientFetch, ask } from '@ai-devs-4/general';

export const TASK = 'failure';

const LOG_URL = `https://hub.ag3nts.org/data/${config.AIDEVS_API_KEY}/failure.log`;
const HUB_URL = 'https://hub.ag3nts.org/verify';

const SEVERITY_PATTERN = /\[(CRIT|ERRO|WARN)\]/;
const TIMESTAMP_PATTERN = /\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}/;
const MAX_ITERATIONS = 5;
const TOKEN_BUDGET = 1400; // Hub limit is 1500, leave margin

interface HubFeedback {
  code: number;
  message: string;
  tokenCount?: number;
  lineCount?: number;
}

interface SubsystemEntry {
  id: string;
  lines: string[];
  maxSeverity: 'CRIT' | 'ERRO' | 'WARN';
}

const SEVERITY_RANK: Record<string, number> = { CRIT: 3, ERRO: 2, WARN: 1 };

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

/** Sort lines chronologically by timestamp */
function sortChronologically(text: string): string {
  return text
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .sort((a, b) => {
      const tA = a.match(/\[(\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2})\]/)?.[1] ?? '';
      const tB = b.match(/\[(\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2})\]/)?.[1] ?? '';
      return tA.localeCompare(tB);
    })
    .join('\n');
}

/** Trim to token budget by removing WARN lines first, then ERRO */
function trimToTokenBudget(text: string, budget: number): string {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  // Remove duplicate lines
  const unique = [...new Set(lines)];

  while (estimateTokens(unique.join('\n')) > budget && unique.length > 0) {
    // Find last WARN line to remove
    const warnIdx = unique.findLastIndex((l) => l.includes('[WARN]'));
    if (warnIdx >= 0) {
      unique.splice(warnIdx, 1);
    } else {
      // Remove last ERRO line
      const erroIdx = unique.findLastIndex((l) => l.includes('[ERRO]'));
      if (erroIdx >= 0) {
        unique.splice(erroIdx, 1);
      } else {
        unique.pop();
      }
    }
  }
  return unique.join('\n');
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

function groupBySubsystem(lines: string[]): Map<string, SubsystemEntry> {
  const map = new Map<string, SubsystemEntry>();
  for (const line of lines) {
    const m = line.match(/\[(CRIT|ERRO|WARN)\]\s+(\S+)/);
    if (!m) continue;
    const severity = m[1] as 'CRIT' | 'ERRO' | 'WARN';
    const id = m[2]!;
    const existing = map.get(id);
    if (existing) {
      existing.lines.push(line);
      if ((SEVERITY_RANK[severity] ?? 0) > (SEVERITY_RANK[existing.maxSeverity] ?? 0)) {
        existing.maxSeverity = severity;
      }
    } else {
      map.set(id, { id, lines: [line], maxSeverity: severity });
    }
  }
  return map;
}

/** Pick 1 most-severe line per subsystem */
function pickOnePerSubsystem(subsystems: Map<string, SubsystemEntry>): string[] {
  const result: string[] = [];
  for (const sub of subsystems.values()) {
    const best = [...sub.lines].sort((a, b) => {
      const sevA = a.match(/\[(CRIT|ERRO|WARN)\]/)?.[1] ?? 'WARN';
      const sevB = b.match(/\[(CRIT|ERRO|WARN)\]/)?.[1] ?? 'WARN';
      return (SEVERITY_RANK[sevB] ?? 0) - (SEVERITY_RANK[sevA] ?? 0);
    })[0];
    if (best) result.push(best);
  }
  return result;
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

  // Step 2: Group by subsystem
  const subsystems = groupBySubsystem(sevLines);
  const subsystemIds = [...subsystems.keys()];
  console.log(`[s02e03] Found ${subsystems.size} unique subsystems: ${subsystemIds.join(', ')}`);

  // Step 3: Build baseline — 1 line per subsystem (guaranteed coverage)
  const baseline = pickOnePerSubsystem(subsystems);
  console.log(`[s02e03] Baseline: ${baseline.length} lines (1/subsystem), ~${estimateTokens(baseline.join('\n'))} tokens`);

  // Step 4: LLM compression — give it ALL severity lines but ask for tight output
  // Include the baseline subsystem list so it knows what to cover
  const compressed = await ask(
    `Compress these power plant log entries into a condensed incident report.\n\n` +
    `CRITICAL RULES:\n` +
    `- Output format: YYYY-MM-DD HH:MM [LEVEL] SUBSYSTEM_ID brief_description\n` +
    `- ALL ${subsystems.size} subsystems MUST appear: ${subsystemIds.join(', ')}\n` +
    `- Strict chronological order by timestamp\n` +
    `- Max 1-2 lines per subsystem, only the most critical events\n` +
    `- Keep descriptions very short (5-10 words max)\n` +
    `- Total output must be under 40 lines\n` +
    `- NO markdown, NO code fences, NO commentary — ONLY log lines\n\n` +
    `Log entries:\n${sevLines.join('\n')}`,
    {
      model: 'gpt-4o-mini',
      temperature: 0,
      systemPrompt: 'You are a log compressor. Output only log lines. No markdown. No commentary. No code fences.',
    },
  );

  let condensed = sanitizeLlmOutput(compressed);
  console.log(`[s02e03] LLM compressed: ~${estimateTokens(condensed)} tokens, ${condensed.split('\n').length} lines`);

  // Step 5: Patch missing subsystems with raw lines from baseline
  const missingAfterLlm = subsystemIds.filter((id) => !condensed.includes(id));
  if (missingAfterLlm.length > 0) {
    console.log(`[s02e03] Patching ${missingAfterLlm.length} missing subsystems: ${missingAfterLlm.join(', ')}`);
    for (const id of missingAfterLlm) {
      const entry = subsystems.get(id);
      if (entry) {
        const best = baseline.find((l) => l.includes(id));
        if (best) condensed += '\n' + best;
      }
    }
  }

  // Step 6: Sort chronologically and trim to budget
  condensed = sortChronologically(condensed);
  condensed = trimToTokenBudget(condensed, TOKEN_BUDGET);
  console.log(`[s02e03] Final: ~${estimateTokens(condensed)} tokens, ${condensed.split('\n').length} lines`);

  // Step 7: Submit and iterate
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    console.log(`[s02e03] Submission attempt ${i + 1}/${MAX_ITERATIONS}`);
    const result = await submitToHub(condensed);

    const flagMatch = result.message.match(/\{FLG:[^}]+\}/);
    if (flagMatch) {
      console.log(`[s02e03] Flag found: ${flagMatch[0]}`);
      return result.message;
    }

    console.log(`[s02e03] No flag — feedback: ${result.message}`);

    // Handle "what happened to X" feedback
    const missingSubMatch = result.message.match(/what happened to (\S+)/i);
    const missingSubId = missingSubMatch?.[1]?.replace(/[.,!?]+$/, '');

    if (missingSubId) {
      console.log(`[s02e03] Adding missing subsystem: ${missingSubId}`);
      const subLines = sevLines.filter((l) => l.includes(missingSubId));
      if (subLines.length > 0) {
        const best = subLines.sort((a, b) =>
          (SEVERITY_RANK[b.match(/\[(CRIT|ERRO|WARN)\]/)?.[1] ?? 'WARN'] ?? 0)
          - (SEVERITY_RANK[a.match(/\[(CRIT|ERRO|WARN)\]/)?.[1] ?? 'WARN'] ?? 0)
        )[0]!;
        condensed += '\n' + best;
      } else {
        const allLines = rawLog.split('\n').filter((l) => l.includes(missingSubId));
        if (allLines.length > 0) condensed += '\n' + allLines[0]!;
      }
      // Re-sort and trim
      condensed = sortChronologically(condensed);
      condensed = trimToTokenBudget(condensed, TOKEN_BUDGET);
    } else if (result.message.includes('chronological order')) {
      // Re-sort
      condensed = sortChronologically(condensed);
    } else if (result.message.includes('compression') || result.message.includes('context window')) {
      // Too long — trim harder
      condensed = trimToTokenBudget(condensed, TOKEN_BUDGET - 200);
      console.log(`[s02e03] Trimmed to ~${estimateTokens(condensed)} tokens`);
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
