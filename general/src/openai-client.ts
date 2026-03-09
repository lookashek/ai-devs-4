import OpenAI from 'openai';
import { config } from './config.js';

export const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

export type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

/**
 * Send a chat completion request to OpenAI.
 * Model defaults to OPENAI_MODEL from .env (fallback: gpt-4o).
 */
export async function chat(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<string> {
  const { model = config.OPENAI_MODEL, temperature = 0.2, maxTokens, systemPrompt } = options;

  const fullMessages: ChatMessage[] = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;

  const response = await openai.chat.completions.create({
    model,
    messages: fullMessages,
    temperature,
    ...(maxTokens !== undefined && { max_tokens: maxTokens }),
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned empty response');
  return content;
}

/**
 * Send a single user message and get a text reply.
 * Convenience wrapper around `chat()`.
 */
export async function ask(userMessage: string, options: ChatOptions = {}): Promise<string> {
  return chat([{ role: 'user', content: userMessage }], options);
}
