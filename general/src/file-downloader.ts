import { writeFile, mkdir } from 'fs/promises';
import { dirname, join, resolve } from 'path';

export interface DownloadedFile {
  url: string;
  localPath: string;
  type: 'text' | 'image';
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg']);

function isImageUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return [...IMAGE_EXTENSIONS].some(ext => lower.endsWith(ext));
}

/**
 * Download a file from a URL and save it to disk.
 * Returns the absolute path of the saved file.
 */
export async function downloadFile(url: string, outputPath: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`[file-downloader] Failed to download ${url}: HTTP ${response.status}`);
  }

  const absPath = resolve(outputPath);
  await mkdir(dirname(absPath), { recursive: true });

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(absPath, buffer);

  return absPath;
}

/**
 * Fetch a URL and return its content as a string.
 */
export async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`[file-downloader] Failed to fetch ${url}: HTTP ${response.status}`);
  }
  return response.text();
}

/**
 * Fetch an index/markdown file, parse it for all relative links,
 * download all referenced files to outputDir, and return metadata.
 */
export async function fetchAndFollowLinks(
  baseUrl: string,
  indexPath: string,
  outputDir: string,
): Promise<DownloadedFile[]> {
  const indexUrl = baseUrl + indexPath;
  console.log(`[file-downloader] Fetching index: ${indexUrl}`);
  const indexContent = await fetchText(indexUrl);

  // Save the index file itself
  const indexLocalPath = join(outputDir, indexPath);
  await mkdir(dirname(resolve(indexLocalPath)), { recursive: true });
  await writeFile(resolve(indexLocalPath), indexContent, 'utf-8');

  const results: DownloadedFile[] = [
    { url: indexUrl, localPath: resolve(indexLocalPath), type: 'text' },
  ];

  // Parse markdown for links: [text](path) and ![alt](path)
  const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g;
  const links = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(indexContent)) !== null) {
    const href = match[1];
    // Skip absolute URLs, anchors, and empty hrefs
    if (href && !href.startsWith('http') && !href.startsWith('#') && !href.startsWith('mailto:')) {
      links.add(href);
    }
  }

  console.log(`[file-downloader] Found ${links.size} linked files in index`);

  for (const link of links) {
    const fileUrl = baseUrl + link;
    const localPath = join(outputDir, link);
    const fileType = isImageUrl(link) ? 'image' : 'text';

    try {
      console.log(`[file-downloader] Downloading: ${fileUrl}`);
      const absPath = await downloadFile(fileUrl, localPath);
      results.push({ url: fileUrl, localPath: absPath, type: fileType });

      // If it's a text file, recursively parse it for more links
      if (fileType === 'text') {
        const content = await fetchText(fileUrl);
        let nestedMatch: RegExpExecArray | null;
        const nestedPattern = /!?\[[^\]]*\]\(([^)]+)\)/g;
        while ((nestedMatch = nestedPattern.exec(content)) !== null) {
          const nestedHref = nestedMatch[1];
          if (
            nestedHref &&
            !nestedHref.startsWith('http') &&
            !nestedHref.startsWith('#') &&
            !nestedHref.startsWith('mailto:') &&
            !links.has(nestedHref)
          ) {
            links.add(nestedHref);
            const nestedUrl = baseUrl + nestedHref;
            const nestedLocalPath = join(outputDir, nestedHref);
            const nestedType = isImageUrl(nestedHref) ? 'image' : 'text';

            try {
              console.log(`[file-downloader] Downloading (nested): ${nestedUrl}`);
              const nestedAbsPath = await downloadFile(nestedUrl, nestedLocalPath);
              results.push({ url: nestedUrl, localPath: nestedAbsPath, type: nestedType });
            } catch (err) {
              console.warn(`[file-downloader] Failed to download nested file: ${nestedUrl}`, err);
            }
          }
        }
      }
    } catch (err) {
      console.warn(`[file-downloader] Failed to download: ${fileUrl}`, err);
    }
  }

  console.log(`[file-downloader] Downloaded ${results.length} files total`);
  return results;
}
