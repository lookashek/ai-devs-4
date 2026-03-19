import { fileURLToPath } from 'url';
import { z } from 'zod';
import { config, resilientFetch, submitAnswer, ask } from '@ai-devs-4/general';

export const TASK = 'mailbox';

const ZMAIL_URL = 'https://hub.ag3nts.org/api/zmail';
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 5000;

const LOG_PREFIX = '[mailbox]';
const API_CALL_DELAY_MS = 800;

// Hardcoded from help response — no dynamic detection
const READ_MESSAGE_ACTION = 'getMessages';
const READ_MESSAGE_PARAM = 'ids';

// --- Zod schemas (lenient with passthrough) ---

const MailItemSchema = z.object({
  messageID: z.string(),
  subject: z.string().optional(),
  from: z.string().optional(),
  date: z.string().optional(),
  snippet: z.string().optional(),
}).passthrough();

const MailMessageSchema = z.object({
  messageID: z.string(),
  subject: z.string().optional(),
  from: z.string().optional(),
  date: z.string().optional(),
  body: z.string().optional(),
  content: z.string().optional(),
  message: z.string().optional(),
}).passthrough();

type MailItem = z.infer<typeof MailItemSchema>;
type MailMessage = z.infer<typeof MailMessageSchema>;

interface FoundData {
  date: string | undefined;
  password: string | undefined;
  confirmation_code: string | undefined;
}

// --- zmail API client ---

export async function zmailRequest(action: string, params?: Record<string, unknown>): Promise<unknown> {
  const body = {
    apikey: config.AIDEVS_API_KEY,
    action,
    ...params,
  };

  console.log(`${LOG_PREFIX} zmail request: action=${action}`, params ?? '');

  const response = await resilientFetch(ZMAIL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data: unknown = await response.json();
  return data;
}

export async function getHelp(): Promise<unknown> {
  const result = await zmailRequest('help');
  console.log(`${LOG_PREFIX} Help response:`, JSON.stringify(result, null, 2));
  return result;
}

export async function getInbox(page?: number): Promise<MailItem[]> {
  const result = await zmailRequest('getInbox', { page: page ?? 1 });
  return parseMailList(result);
}

export async function searchMail(query: string, page?: number): Promise<MailItem[]> {
  const params: Record<string, unknown> = { query };
  if (page !== undefined) {
    params['page'] = page;
  }
  const result = await zmailRequest('search', params);
  return parseMailList(result);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getMessage(messageId: string): Promise<MailMessage> {
  await delay(API_CALL_DELAY_MS);
  const result = await zmailRequest(READ_MESSAGE_ACTION, { [READ_MESSAGE_PARAM]: messageId });
  return parseMailMessage(result);
}

// --- Response parsers (flexible to handle different API shapes) ---

function parseMailList(data: unknown): MailItem[] {
  if (!data || typeof data !== 'object') return [];

  const obj = data as Record<string, unknown>;

  // Try common response shapes — API returns { items: [...] }
  const candidates = [obj['items'], obj['messages'], obj['data'], obj['emails'], obj['inbox'], obj['results']];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map((item) => MailItemSchema.parse(item));
    }
  }

  // Maybe the response itself is an array
  if (Array.isArray(data)) {
    return (data as unknown[]).map((item) => MailItemSchema.parse(item));
  }

  console.log(`${LOG_PREFIX} Could not parse mail list from:`, JSON.stringify(data).substring(0, 500));
  return [];
}

function parseMailMessage(data: unknown): MailMessage {
  if (!data || typeof data !== 'object') {
    throw new Error(`${LOG_PREFIX} Invalid message response: ${JSON.stringify(data)}`);
  }

  const obj = data as Record<string, unknown>;

  // Detect if API returned the help response (wrong action name)
  if (obj['actions'] || (typeof obj['description'] === 'string' && obj['description'].toString().includes('API'))) {
    console.error(`${LOG_PREFIX} API returned help response instead of message — action "${READ_MESSAGE_ACTION}" is invalid!`);
    throw new Error(`Invalid action "${READ_MESSAGE_ACTION}" — API returned help instead of message`);
  }

  // getMessages returns { items: [{...message...}] }
  if (Array.isArray(obj['items']) && (obj['items'] as unknown[]).length > 0) {
    return MailMessageSchema.parse((obj['items'] as unknown[])[0]);
  }

  // Try common shapes: { message: {...} }, { data: {...} }, or the object itself
  const candidates = [obj['data'], obj['email'], obj['item']];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      return MailMessageSchema.parse(candidate);
    }
  }

  // Maybe the response itself is the message
  if ('messageID' in obj || 'body' in obj || 'content' in obj || 'subject' in obj) {
    return MailMessageSchema.parse(data);
  }

  console.log(`${LOG_PREFIX} Could not parse message from:`, JSON.stringify(data).substring(0, 500));
  return MailMessageSchema.parse({ messageID: 'unknown', body: JSON.stringify(data) });
}

// --- LLM-based extraction ---

const EXTRACT_SYSTEM_PROMPT = `You extract structured data from emails. Return ONLY valid JSON, no markdown fences, no explanation.
If a value is not present in the text, omit it from the JSON.`;

async function extractWithLLM(text: string, found: FoundData): Promise<void> {
  const missing: string[] = [];
  if (!found.date) missing.push('- date: the date (YYYY-MM-DD) when the security department plans to attack/inspect the power plant. NOT the email send date.');
  if (!found.password) missing.push('- password: a password or credential to the employee system. Should be a meaningful password string, not a common word.');
  if (!found.confirmation_code) missing.push('- confirmation_code: a code starting with SEC- followed by hex characters (e.g. SEC-abc123...)');

  if (missing.length === 0) return;

  const prompt = `Extract the following values from this email. Return a JSON object with only the found keys.\n\nValues to find:\n${missing.join('\n')}\n\nEmail:\n${text}`;

  try {
    const response = await ask(prompt, {
      temperature: 0,
      systemPrompt: EXTRACT_SYSTEM_PROMPT,
    });

    console.log(`${LOG_PREFIX} LLM extraction response: ${response}`);

    // Strip markdown fences if present
    const cleaned = response.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned) as Record<string, string>;

    if (parsed['date'] && !found.date) {
      console.log(`${LOG_PREFIX} LLM found date: ${parsed['date']}`);
      found.date = parsed['date'];
    }
    if (parsed['password'] && !found.password) {
      console.log(`${LOG_PREFIX} LLM found password: ${parsed['password']}`);
      found.password = parsed['password'];
    }
    if (parsed['confirmation_code'] && !found.confirmation_code) {
      console.log(`${LOG_PREFIX} LLM found confirmation_code: ${parsed['confirmation_code']}`);
      found.confirmation_code = parsed['confirmation_code'];
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} LLM extraction error:`, err);
  }
}

// --- Main agent loop ---

async function searchAndExtract(found: FoundData, readMessageIds: Set<string>): Promise<void> {
  const queries = [
    'from:proton.me',
    'subject:hasło',
    'SEC-',
    'subject:ticket',
    'hasło',
    'confirmation',
  ];

  for (const query of queries) {
    // Skip if all values already found
    if (found.date && found.password && found.confirmation_code) break;

    try {
      console.log(`${LOG_PREFIX} Searching: "${query}"`);
      const items = await searchMail(query);
      console.log(`${LOG_PREFIX} Found ${items.length} results for "${query}"`);

      for (const item of items) {
        if (readMessageIds.has(item.messageID)) continue;
        readMessageIds.add(item.messageID);

        if (found.date && found.password && found.confirmation_code) break;

        console.log(`${LOG_PREFIX} Reading message ${item.messageID}: "${item.subject}" from ${item.from}`);
        try {
          const msg = await getMessage(item.messageID);
          const body = msg.message ?? msg.body ?? msg.content ?? '';
          const fullText = `Subject: ${msg.subject ?? ''}\nFrom: ${msg.from ?? ''}\nBody: ${body}`;
          console.log(`${LOG_PREFIX} Message body: ${body}`);
          await extractWithLLM(fullText, found);
        } catch (err) {
          console.error(`${LOG_PREFIX} Error reading message ${item.messageID}:`, err);
        }
      }
    } catch (err) {
      console.error(`${LOG_PREFIX} Error searching "${query}":`, err);
    }

    // Rate limit between search queries
    await delay(API_CALL_DELAY_MS);
  }

  // If still missing values, try reading the full inbox
  if (!found.date || !found.password || !found.confirmation_code) {
    console.log(`${LOG_PREFIX} Values still missing, scanning full inbox...`);
    let page = 1;
    const maxPages = 10;

    while (page <= maxPages) {
      try {
        const items = await getInbox(page);
        if (items.length === 0) break;

        console.log(`${LOG_PREFIX} Inbox page ${page}: ${items.length} messages`);

        for (const item of items) {
          if (readMessageIds.has(item.messageID)) continue;
          readMessageIds.add(item.messageID);

          if (found.date && found.password && found.confirmation_code) break;

          try {
            const msg = await getMessage(item.messageID);
            const body = msg.message ?? msg.body ?? msg.content ?? '';
            const fullText = `Subject: ${msg.subject ?? ''}\nFrom: ${msg.from ?? ''}\nBody: ${body}`;
            console.log(`${LOG_PREFIX} Message body: ${body}`);
            await extractWithLLM(fullText, found);
          } catch (err) {
            console.error(`${LOG_PREFIX} Error reading message ${item.messageID}:`, err);
          }
        }

        if (found.date && found.password && found.confirmation_code) break;
        page++;
      } catch (err) {
        console.error(`${LOG_PREFIX} Error reading inbox page ${page}:`, err);
        break;
      }
    }
  }
}

export async function main(): Promise<string> {
  // Step 1: Discover API
  const helpResult = await getHelp();

  console.log(`${LOG_PREFIX} Using action: "${READ_MESSAGE_ACTION}", param: "${READ_MESSAGE_PARAM}"`);

  const found: FoundData = {
    date: undefined,
    password: undefined,
    confirmation_code: undefined,
  };

  const readMessageIds = new Set<string>();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`${LOG_PREFIX} === Attempt ${attempt}/${MAX_RETRIES} ===`);

    // Reset rate limiter on retries to recover from 429 cascades
    if (attempt > 1) {
      console.log(`${LOG_PREFIX} Calling reset to clear rate limit counter...`);
      await zmailRequest('reset');
      await delay(1000);
    }

    // Search and extract values
    await searchAndExtract(found, readMessageIds);

    console.log(`${LOG_PREFIX} Current state:`, JSON.stringify(found));

    // Only submit when at least one value is found
    if (!found.date && !found.password && !found.confirmation_code) {
      console.log(`${LOG_PREFIX} No values found yet, skipping submission`);
      if (attempt < MAX_RETRIES) {
        console.log(`${LOG_PREFIX} Waiting ${RETRY_DELAY_MS}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
      continue;
    }

    const answer = {
      date: found.date ?? '',
      password: found.password ?? '',
      confirmation_code: found.confirmation_code ?? '',
    };

    try {
      const result = await submitAnswer({ task: TASK, answer });

      const flagMatch = result.message.match(/\{FLG:[^}]+\}/);
      if (flagMatch) {
        console.log(`${LOG_PREFIX} Flag found: ${flagMatch[0]}`);
        return result.message;
      }

      console.log(`${LOG_PREFIX} Hub feedback: ${result.message}`);

      // Parse feedback to understand what's wrong
      const msg = result.message.toLowerCase();
      if (msg.includes('date') || msg.includes('data')) {
        console.log(`${LOG_PREFIX} Date value may be incorrect, clearing for re-search`);
        found.date = undefined;
      }
      if (msg.includes('password') || msg.includes('hasło')) {
        console.log(`${LOG_PREFIX} Password value may be incorrect, clearing for re-search`);
        found.password = undefined;
      }
      if (msg.includes('confirmation') || msg.includes('code') || msg.includes('sec-')) {
        console.log(`${LOG_PREFIX} Confirmation code may be incorrect, clearing for re-search`);
        found.confirmation_code = undefined;
      }
    } catch (err) {
      console.error(`${LOG_PREFIX} Submission error:`, err);
    }

    // Wait before retrying (inbox is dynamic, new messages may arrive)
    if (attempt < MAX_RETRIES) {
      console.log(`${LOG_PREFIX} Waiting ${RETRY_DELAY_MS}ms before retry...`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }

  return `${LOG_PREFIX} Max retries reached without finding flag`;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(`${LOG_PREFIX} Fatal error:`, err);
    process.exit(1);
  });
}
