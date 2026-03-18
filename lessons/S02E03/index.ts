import { fileURLToPath } from 'url';
import { config, resilientFetch, submitAnswer, ask } from '@ai-devs-4/general';

export const TASK = 'failure';

const LOG_URL = `https://hub.ag3nts.org/data/${config.AIDEVS_API_KEY}/failure.log`;

const SEVERITY_PATTERN = /\[(CRIT|ERRO|WARN)\]/i;

const MAX_ITERATIONS = 5;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

export async function downloadLog(): Promise<string> {
  const response = await resilientFetch(LOG_URL);
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

export function filterByKeywords(lines: string[]): string[] {
  const keywords = [
    'coolant', 'pump', 'power', 'reactor', 'temp', 'pressure',
    'cooling', 'water', 'generator', 'turbine', 'valve', 'trip',
    'shutdown', 'overload', 'voltage', 'frequency', 'fuel', 'rod',
    'containment', 'steam', 'condenser', 'feedwater', 'boron',
    'neutron', 'scram', 'emergency', 'backup', 'diesel', 'battery',
    'transformer', 'breaker', 'grid', 'load', 'sensor', 'alarm',
    'interlock', 'protection', 'runaway', 'leak', 'rupture',
    'radiation', 'dose', 'vent', 'blowdown', 'meltdown',
  ];
  const pattern = new RegExp(keywords.join('|'), 'i');
  const filtered = lines.filter((line) => pattern.test(line));
  console.log(`[s02e03] Keyword filter: ${lines.length} → ${filtered.length} lines`);
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
    `- Preserve ALL timestamps, severity levels ([CRIT]/[WARN]/[ERRO]), and subsystem IDs\n` +
    `- Shorten descriptions to essential meaning — remove verbose details\n` +
    `- Group repeated similar events — keep first occurrence and most severe\n` +
    `- Prioritize: CRIT > ERRO > WARN\n` +
    `- Cover ALL subsystems present in the data\n` +
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

export async function submitLogs(logs: string): Promise<{ message: string; code: number }> {
  const result = await submitAnswer({
    task: TASK,
    answer: { logs },
  });
  return result;
}

export async function run(): Promise<string> {
  // Step 1: Download
  const rawLog = await downloadLog();

  // Step 2: Filter by severity
  const sevLines = filterBySeverity(rawLog);

  // Step 3: Filter by keywords
  const kwLines = filterByKeywords(sevLines);

  // Step 4: Compress
  let condensed = await compressLogs(kwLines);
  console.log(`[s02e03] Final token estimate: ~${estimateTokens(condensed)}`);

  // Step 5: Submit and iterate
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    console.log(`[s02e03] Submission attempt ${i + 1}/${MAX_ITERATIONS}`);
    const result = await submitLogs(condensed);
    console.log(`[s02e03] Hub response: ${result.message}`);

    const flagMatch = result.message.match(/\{FLG:[^}]+\}/);
    if (flagMatch) {
      console.log(`[s02e03] Flag found: ${flagMatch[0]}`);
      return result.message;
    }

    // Parse feedback and enhance logs
    console.log(`[s02e03] No flag yet, attempting to improve based on feedback...`);
    const enhanced = await ask(
      `The power plant log analysis system returned this feedback:\n"${result.message}"\n\n` +
      `Current condensed logs:\n${condensed}\n\n` +
      `Full filtered log entries (WARN/ERRO/CRIT with power plant keywords):\n${sevLines.join('\n')}\n\n` +
      `Based on the feedback, produce an improved condensed log. Rules:\n` +
      `- One line per event: [YYYY-MM-DD HH:MM] [LEVEL] SUBSYSTEM_ID brief description\n` +
      `- Add missing subsystem events mentioned in the feedback\n` +
      `- Keep total under 1400 tokens\n` +
      `- Prioritize CRIT > ERRO > WARN\n` +
      `- Output ONLY the log lines, nothing else`,
      {
        model: 'gpt-4o-mini',
        temperature: 0,
        systemPrompt: 'You are a power plant log analyst. Output only compressed log lines, no commentary.',
      },
    );

    const newTokens = estimateTokens(enhanced);
    console.log(`[s02e03] Enhanced logs: ~${newTokens} tokens`);

    if (newTokens <= 1500) {
      condensed = enhanced;
    } else {
      console.log(`[s02e03] Enhanced version too long (${newTokens} tokens), trimming...`);
      const trimLines = enhanced.split('\n');
      while (estimateTokens(trimLines.join('\n')) > 1400 && trimLines.length > 0) {
        // Remove last WARN line if possible
        const warnIdx = trimLines.findLastIndex((l) => l.includes('[WARN]'));
        if (warnIdx >= 0) {
          trimLines.splice(warnIdx, 1);
        } else {
          trimLines.pop();
        }
      }
      condensed = trimLines.join('\n');
    }
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
