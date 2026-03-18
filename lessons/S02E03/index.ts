import { fileURLToPath } from 'url';
import { config, resilientFetch, ask } from '@ai-devs-4/general';

export const TASK = 'failure';

const LOG_URL = `https://hub.ag3nts.org/data/${config.AIDEVS_API_KEY}/failure.log`;
const HUB_URL = 'https://hub.ag3nts.org/verify';

const SEVERITY_PATTERN = /\[(CRIT|ERRO|WARN)\]/;

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

interface SubsystemEntry {
  id: string;
  lines: string[];
  maxSeverity: 'CRIT' | 'ERRO' | 'WARN';
}

const SEVERITY_RANK: Record<string, number> = { CRIT: 3, ERRO: 2, WARN: 1 };

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

/** Pick representative lines per subsystem: most severe first, limit per subsystem */
function selectRepresentativeLines(subsystems: Map<string, SubsystemEntry>, maxLinesPerSub: number): string[] {
  const result: string[] = [];

  // Sort subsystems: CRIT first, then ERRO, then WARN
  const sorted = [...subsystems.values()].sort(
    (a, b) => (SEVERITY_RANK[b.maxSeverity] ?? 0) - (SEVERITY_RANK[a.maxSeverity] ?? 0),
  );

  for (const sub of sorted) {
    // Sort lines within subsystem by severity (most severe first)
    const sortedLines = [...sub.lines].sort((a, b) => {
      const sevA = a.match(/\[(CRIT|ERRO|WARN)\]/)?.[1] ?? 'WARN';
      const sevB = b.match(/\[(CRIT|ERRO|WARN)\]/)?.[1] ?? 'WARN';
      return (SEVERITY_RANK[sevB] ?? 0) - (SEVERITY_RANK[sevA] ?? 0);
    });
    result.push(...sortedLines.slice(0, maxLinesPerSub));
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
  // Step 1: Download
  const rawLog = await downloadLog();

  // Step 2: Filter by severity
  const sevLines = filterBySeverity(rawLog);

  // Step 3: Group by subsystem and analyze
  const subsystems = groupBySubsystem(sevLines);
  console.log(`[s02e03] Found ${subsystems.size} unique subsystems`);
  for (const [id, entry] of subsystems) {
    console.log(`[s02e03]   ${id}: ${entry.lines.length} lines, max severity: ${entry.maxSeverity}`);
  }

  // Step 4: Select representative lines — ensure ALL subsystems are covered
  // Start with 3 lines per subsystem, adjust if over budget
  let maxPerSub = 3;
  let selected = selectRepresentativeLines(subsystems, maxPerSub);
  while (estimateTokens(selected.join('\n')) > 4500 && maxPerSub > 1) {
    maxPerSub--;
    selected = selectRepresentativeLines(subsystems, maxPerSub);
  }
  console.log(`[s02e03] Selected ${selected.length} representative lines (${maxPerSub}/subsystem), ~${estimateTokens(selected.join('\n'))} tokens`);

  // Step 5: Use LLM to compress selected lines into coherent summary
  const compressed = await ask(
    `Analyze these power plant log entries and produce a condensed incident log.\n` +
    `There are ${subsystems.size} subsystems — EVERY subsystem MUST appear in your output.\n\n` +
    `Rules:\n` +
    `- One line per event, format: [YYYY-MM-DD HH:MM] [LEVEL] SUBSYSTEM_ID brief description\n` +
    `- Keep ALL subsystem IDs exactly as they appear (e.g. ${[...subsystems.keys()].join(', ')})\n` +
    `- Include at least one line for EACH of the ${subsystems.size} subsystems\n` +
    `- Prioritize CRIT events, then ERRO, then WARN\n` +
    `- Keep chronological order within each subsystem\n` +
    `- Keep total output under 1200 tokens\n` +
    `- Output ONLY the compressed log lines, nothing else\n\n` +
    `Log entries:\n${selected.join('\n')}`,
    {
      model: 'gpt-4o-mini',
      temperature: 0,
      systemPrompt: 'You are a power plant log analyst. Output only compressed log lines, no commentary.',
    },
  );

  let condensed = compressed;
  console.log(`[s02e03] Compressed: ~${estimateTokens(condensed)} tokens, ${condensed.split('\n').length} lines`);

  // Verify all subsystems are present
  const missingInOutput = [...subsystems.keys()].filter((id) => !condensed.includes(id));
  if (missingInOutput.length > 0) {
    console.log(`[s02e03] WARNING: Missing subsystems in compressed output: ${missingInOutput.join(', ')}`);
    // Add missing subsystems manually — take the most severe line for each
    for (const id of missingInOutput) {
      const entry = subsystems.get(id);
      if (entry) {
        const mostSevere = entry.lines.sort(
          (a, b) => (SEVERITY_RANK[b.match(/\[(CRIT|ERRO|WARN)\]/)?.[1] ?? 'WARN'] ?? 0)
                   - (SEVERITY_RANK[a.match(/\[(CRIT|ERRO|WARN)\]/)?.[1] ?? 'WARN'] ?? 0),
        )[0];
        if (mostSevere) {
          condensed += '\n' + mostSevere;
        }
      }
    }
    console.log(`[s02e03] After patching: ~${estimateTokens(condensed)} tokens`);
  }

  // Step 6: Submit and iterate
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    console.log(`[s02e03] Submission attempt ${i + 1}/${MAX_ITERATIONS}`);
    const result = await submitToHub(condensed);

    const flagMatch = result.message.match(/\{FLG:[^}]+\}/);
    if (flagMatch) {
      console.log(`[s02e03] Flag found: ${flagMatch[0]}`);
      return result.message;
    }

    console.log(`[s02e03] No flag — feedback: ${result.message}`);

    // Extract mentioned missing subsystem from feedback
    const missingSubMatch = result.message.match(/what happened to (\S+)/i);
    const missingSubId = missingSubMatch?.[1]?.replace(/[.,!?]+$/, '');

    if (missingSubId) {
      console.log(`[s02e03] Feedback mentions missing subsystem: ${missingSubId}`);
      // Find all lines for this subsystem from original data
      const subLines = sevLines.filter((l) => l.includes(missingSubId));
      console.log(`[s02e03] Found ${subLines.length} lines for ${missingSubId} in original data`);

      if (subLines.length > 0) {
        // Add the most important lines for this subsystem
        const toAdd = subLines
          .sort((a, b) => (SEVERITY_RANK[b.match(/\[(CRIT|ERRO|WARN)\]/)?.[1] ?? 'WARN'] ?? 0)
                        - (SEVERITY_RANK[a.match(/\[(CRIT|ERRO|WARN)\]/)?.[1] ?? 'WARN'] ?? 0))
          .slice(0, 3);
        condensed += '\n' + toAdd.join('\n');
        console.log(`[s02e03] Added ${toAdd.length} lines for ${missingSubId}`);
      } else {
        // Search in ALL lines (including INFO)
        const allLines = rawLog.split('\n').filter((l) => l.includes(missingSubId));
        console.log(`[s02e03] Found ${allLines.length} lines for ${missingSubId} in ALL log data`);
        if (allLines.length > 0) {
          condensed += '\n' + allLines.slice(0, 3).join('\n');
        }
      }
    } else {
      // General feedback — use LLM to refine
      console.log(`[s02e03] General feedback, using LLM to refine...`);
      condensed = await ask(
        `Feedback from the system: "${result.message}"\n\n` +
        `Current logs:\n${condensed}\n\n` +
        `All subsystem IDs that must be present: ${[...subsystems.keys()].join(', ')}\n\n` +
        `Improve the log based on feedback. Keep format: [YYYY-MM-DD HH:MM] [LEVEL] SUBSYSTEM_ID description\n` +
        `Ensure ALL subsystems are covered. Output ONLY log lines.`,
        {
          model: 'gpt-4o-mini',
          temperature: 0,
          systemPrompt: 'You are a power plant log analyst. Output only compressed log lines, no commentary.',
        },
      );
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
