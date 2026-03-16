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

  // Step 2: Follow the documented action sequence
  // Based on the plan, the API will tell us what actions are available and in what order
  // We'll parse the response and follow the instructions

  // The plan says typical flow is:
  // 1. help -> get documentation
  // 2. Some status/query action -> get route details
  // 3. Some activation/enable action -> activate the route

  // After reading help, determine what actions are available
  // We'll try common action names based on the task context
  // The API error messages will guide us to the right parameter names

  // Try to find and use the route status action
  emit('Step 2: Checking route status/details', 'info');

  // Based on the self-documenting API pattern, let's try a route status check
  // We'll follow the API's instructions from the help response
  const statusResponse = await callRailwayApi(
    { action: 'status', route: ROUTE_NAME },
    emit,
  );

  const statusMessage = statusResponse.message ?? JSON.stringify(statusResponse);
  emit(`Status response: ${statusMessage}`, 'info');

  // Step 3: Activate the route
  emit('Step 3: Activating route X-01', 'info');

  const activateResponse = await callRailwayApi(
    { action: 'activate', route: ROUTE_NAME },
    emit,
  );

  const activateMessage = activateResponse.message ?? JSON.stringify(activateResponse);
  emit(`Activate response: ${activateMessage}`, 'info');

  // Check if we got the flag
  if (typeof activateMessage === 'string' && activateMessage.includes('{FLG:')) {
    emit(`Task complete! Flag: ${activateMessage}`, 'success');
    return activateResponse;
  }

  // If not, check the status response for flag
  if (typeof statusMessage === 'string' && statusMessage.includes('{FLG:')) {
    emit(`Task complete! Flag: ${statusMessage}`, 'success');
    return statusResponse;
  }

  // Return the last response
  return activateResponse;
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
