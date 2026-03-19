import { fileURLToPath } from 'url';
import { z } from 'zod';
import { config, resilientFetch, submitAnswer } from '@ai-devs-4/general';

export const TASK = 'mailbox';

const ZMAIL_URL = 'https://hub.ag3nts.org/api/zmail';
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 5000;

const LOG_PREFIX = '[mailbox]';

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

export async function getMessage(messageId: string): Promise<MailMessage> {
  const result = await zmailRequest('getMessage', { messageID: messageId });
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

  // Try common shapes: { message: {...} }, { data: {...} }, or the object itself
  const candidates = [obj['message'], obj['data'], obj['email'], obj['item']];
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

// --- Extraction helpers ---

export function extractDate(text: string): string | undefined {
  // Look for YYYY-MM-DD patterns
  const matches = text.match(/\b(\d{4}-\d{2}-\d{2})\b/g);
  if (!matches) return undefined;

  // If only one date, return it
  if (matches.length === 1) return matches[0];

  // If multiple dates, prefer one near keywords about attack/plan
  const attackKeywords = ['atak', 'attack', 'plan', 'elektrowni', 'power plant', 'operacja', 'operation', 'termin', 'data'];
  const lines = text.split('\n');
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (attackKeywords.some((kw) => lower.includes(kw))) {
      const dateMatch = line.match(/\b(\d{4}-\d{2}-\d{2})\b/);
      if (dateMatch) return dateMatch[1];
    }
  }

  return matches[0];
}

export function extractPassword(text: string): string | undefined {
  const passwordKeywords = ['hasło', 'haslo', 'password', 'credentials', 'login', 'pass:'];
  const lines = text.split('\n');

  for (const line of lines) {
    const lower = line.toLowerCase();
    for (const kw of passwordKeywords) {
      if (lower.includes(kw)) {
        // Try patterns like "hasło: value", "password is value", "hasło to value"
        const patterns = [
          new RegExp(`${kw}[:\\s]+["\`']?([^\\s"'\`<>]+)["\`']?`, 'i'),
          new RegExp(`${kw}\\s+(?:to|is|jest|=)\\s+["\`']?([^\\s"'\`<>]+)["\`']?`, 'i'),
        ];
        for (const pattern of patterns) {
          const match = line.match(pattern);
          if (match?.[1]) return match[1];
        }
      }
    }
  }

  return undefined;
}

export function extractConfirmationCode(text: string): string | undefined {
  // SEC- followed by exactly 28 characters (32 total)
  const match = text.match(/SEC-[A-Za-z0-9]{28}/);
  return match ? match[0] : undefined;
}

function extractAllValues(text: string, found: FoundData): void {
  if (!found.date) {
    const date = extractDate(text);
    if (date) {
      console.log(`${LOG_PREFIX} Found date: ${date}`);
      found.date = date;
    }
  }

  if (!found.password) {
    const password = extractPassword(text);
    if (password) {
      console.log(`${LOG_PREFIX} Found password: ${password}`);
      found.password = password;
    }
  }

  if (!found.confirmation_code) {
    const code = extractConfirmationCode(text);
    if (code) {
      console.log(`${LOG_PREFIX} Found confirmation_code: ${code}`);
      found.confirmation_code = code;
    }
  }
}

// --- Main agent loop ---

async function searchAndExtract(found: FoundData): Promise<void> {
  const queries = [
    'from:proton.me',
    'subject:hasło',
    'SEC-',
    'subject:ticket',
    'hasło',
    'confirmation',
  ];

  const readMessageIds = new Set<string>();

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

        console.log(`${LOG_PREFIX} Reading message ${item.messageID}: "${item.subject}" from ${item.from}`);
        try {
          const msg = await getMessage(item.messageID);
          const fullText = [msg.subject ?? '', msg.from ?? '', msg.body ?? msg.content ?? ''].join('\n');
          extractAllValues(fullText, found);
        } catch (err) {
          console.error(`${LOG_PREFIX} Error reading message ${item.messageID}:`, err);
        }
      }
    } catch (err) {
      console.error(`${LOG_PREFIX} Error searching "${query}":`, err);
    }
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

          try {
            const msg = await getMessage(item.messageID);
            const fullText = [msg.subject ?? '', msg.from ?? '', msg.body ?? msg.content ?? ''].join('\n');
            extractAllValues(fullText, found);
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

  // Adapt action names based on help response if needed
  const helpStr = JSON.stringify(helpResult);
  console.log(`${LOG_PREFIX} API help summary: ${helpStr.substring(0, 500)}`);

  const found: FoundData = {
    date: undefined,
    password: undefined,
    confirmation_code: undefined,
  };

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`${LOG_PREFIX} === Attempt ${attempt}/${MAX_RETRIES} ===`);

    // Search and extract values
    await searchAndExtract(found);

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
