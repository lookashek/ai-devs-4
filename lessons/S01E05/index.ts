import { fileURLToPath } from 'url';
import { config, resilientFetch } from '@ai-devs-4/general';

export const TASK = 'railway';
export const ROUTE_NAME = 'X-01';
const HUB_URL = 'https://hub.ag3nts.org/verify';

export interface RailwayResponse {
  code?: number;
  message?: string;
  [key: string]: unknown;
}

export interface LogEntry {
  message: string;
  level: 'info' | 'success' | 'warn' | 'error';
}

export async function callRailwayApi(
  answer: Record<string, unknown>,
  log?: (msg: string, level?: LogEntry['level']) => void,
): Promise<RailwayResponse> {
  const emit = log ?? ((msg: string) => console.log(`[s01e05] ${msg}`));

  const body = JSON.stringify({
    apikey: config.AIDEVS_API_KEY,
    task: TASK,
    answer,
  });

  emit(`Calling action: ${JSON.stringify(answer)}`);

  const response = await resilientFetch(HUB_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  // Log all headers for rate-limit visibility
  const headersObj: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headersObj[key] = value;
  });
  emit(`Response headers: ${JSON.stringify(headersObj)}`, 'info');

  const data = (await response.json()) as RailwayResponse;
  emit(`Response: ${JSON.stringify(data)}`);

  // Check for flag
  const message = data.message ?? '';
  if (typeof message === 'string' && message.includes('{FLG:')) {
    emit(`FLAG FOUND: ${message}`, 'success');
  }

  return data;
}

export async function runRailwayTask(
  log?: (msg: string, level?: LogEntry['level']) => void,
): Promise<RailwayResponse> {
  const emit = log ?? ((msg: string, level?: LogEntry['level']) => {
    const prefix = level === 'error' ? 'ERROR' : level === 'warn' ? 'WARN' : 'INFO';
    console.log(`[s01e05] [${prefix}] ${msg}`);
  });

  emit('Starting railway route activation task...', 'info');

  // Step 1: Get API documentation
  emit('Step 1: Calling help action to get API documentation', 'info');
  const helpResponse = await callRailwayApi({ action: 'help' }, emit);

  emit(`Full help response: ${JSON.stringify(helpResponse, null, 2)}`, 'info');

  // Parse the help response to understand available actions
  // The API is self-documenting — we read the message to understand what to do next
  const helpMessage = helpResponse.message ?? JSON.stringify(helpResponse);
  emit(`Help response message: ${helpMessage}`, 'info');

  // The help response documents the exact sequence:
  // 1. reconfigure — enable reconfigure mode for the route
  // 2. setstatus   — set route status to RTOPEN (open/activate)
  // 3. save        — exit reconfigure mode (commits the change)

  emit('Step 2: Enabling reconfigure mode for route X-01', 'info');
  const reconfigureResponse = await callRailwayApi(
    { action: 'reconfigure', route: ROUTE_NAME },
    emit,
  );
  emit(`Reconfigure response: ${JSON.stringify(reconfigureResponse)}`, 'info');

  emit('Step 3: Setting route status to RTOPEN', 'info');
  const setStatusResponse = await callRailwayApi(
    { action: 'setstatus', route: ROUTE_NAME, value: 'RTOPEN' },
    emit,
  );
  emit(`SetStatus response: ${JSON.stringify(setStatusResponse)}`, 'info');

  const setStatusMessage = setStatusResponse.message ?? '';
  if (typeof setStatusMessage === 'string' && setStatusMessage.includes('{FLG:')) {
    emit(`Task complete! Flag: ${setStatusMessage}`, 'success');
    return setStatusResponse;
  }

  emit('Step 4: Saving and exiting reconfigure mode', 'info');
  const saveResponse = await callRailwayApi(
    { action: 'save', route: ROUTE_NAME },
    emit,
  );
  emit(`Save response: ${JSON.stringify(saveResponse)}`, 'info');

  const saveMessage = saveResponse.message ?? '';
  if (typeof saveMessage === 'string' && saveMessage.includes('{FLG:')) {
    emit(`Task complete! Flag: ${saveMessage}`, 'success');
  }

  return saveResponse;
}

async function main(): Promise<void> {
  console.log('[s01e05] Starting railway route activation task...');

  const result = await runRailwayTask();

  const message = result.message ?? JSON.stringify(result);
  if (typeof message === 'string' && message.includes('{FLG:')) {
    console.log('[s01e05] SUCCESS! Flag:', message);
  } else {
    console.log('[s01e05] Final result:', JSON.stringify(result, null, 2));
    console.log('[s01e05] No flag received — may need to follow additional API steps based on responses above');
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch(err => {
    console.error('[s01e05] Fatal error:', err);
    process.exit(1);
  });
}
