import { z } from 'zod';
import { config } from './config.js';

const HUB_URL = typeof window !== 'undefined'
  ? '/api/hub/verify'
  : 'https://hub.ag3nts.org/verify';

const HubResponseSchema = z.object({
  code: z.number(),
  message: z.string(),
});

export type HubResponse = z.infer<typeof HubResponseSchema>;

interface SubmitAnswerParams {
  task: string;
  answer: unknown;
}

export async function submitAnswer({ task, answer }: SubmitAnswerParams): Promise<HubResponse> {
  const body = {
    apikey: config.AIDEVS_API_KEY,
    task,
    answer,
  };

  console.log(`[hub-api] Submitting answer for task: ${task}`);

  const res = await fetch(HUB_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`[hub-api] HTTP ${res.status}: ${await res.text()}`);
  }

  const data = HubResponseSchema.parse(await res.json());
  console.log(`[hub-api] Response:`, data);
  return data;
}
