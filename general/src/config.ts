import { z } from 'zod';

const ConfigSchema = z.object({
  AIDEVS_API_KEY: z.string().min(1, 'AIDEVS_API_KEY is required'),
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Config = z.infer<typeof ConfigSchema>;

const result = ConfigSchema.safeParse(process.env);

if (!result.success) {
  console.error('Invalid environment variables:');
  console.error(result.error.flatten().fieldErrors);
  process.exit(1);
}

export const config: Config = result.data;
