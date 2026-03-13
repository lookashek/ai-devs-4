import { readFile } from 'fs/promises';
import { extname } from 'path';
import { openai } from './openai-client.js';

const DEFAULT_PROMPT =
  'Extract and return ALL text, data, tables, and information visible in this image. Preserve the original formatting and structure as much as possible.';

const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

function getMediaType(filePath: string): ImageMediaType {
  const ext = extname(filePath).toLowerCase();
  const map: Record<string, ImageMediaType> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  };
  const mediaType = map[ext];
  if (!mediaType) {
    throw new Error(`[image-to-text] Unsupported image format: ${ext}`);
  }
  return mediaType;
}

/**
 * Extract text/information from an image using OpenAI's vision capabilities.
 */
export async function imageToText(imagePath: string, prompt?: string): Promise<string> {
  const ext = extname(imagePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw new Error(
      `[image-to-text] Unsupported file extension: ${ext}. Supported: ${[...SUPPORTED_EXTENSIONS].join(', ')}`,
    );
  }

  const imageBuffer = await readFile(imagePath);
  const base64 = imageBuffer.toString('base64');
  const mediaType = getMediaType(imagePath);

  console.log(`[image-to-text] Processing image: ${imagePath}`);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${mediaType};base64,${base64}`,
            },
          },
          {
            type: 'text',
            text: prompt ?? DEFAULT_PROMPT,
          },
        ],
      },
    ],
    max_tokens: 4096,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('[image-to-text] OpenAI returned empty response');
  return content;
}
