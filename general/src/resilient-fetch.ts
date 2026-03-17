export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  retryOnStatus?: number[];
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 10,
  initialDelayMs: 2000,
  maxDelayMs: 60000,
  retryOnStatus: [503, 429],
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseRateLimitHeaders(headers: Headers): {
  remaining: number | undefined;
  resetAt: Date | undefined;
} {
  const remainingRaw =
    headers.get('X-RateLimit-Remaining') ??
    headers.get('RateLimit-Remaining') ??
    headers.get('x-ratelimit-remaining');

  const resetRaw =
    headers.get('X-RateLimit-Reset') ??
    headers.get('RateLimit-Reset') ??
    headers.get('x-ratelimit-reset');

  const remaining = remainingRaw !== null ? parseInt(remainingRaw, 10) : undefined;

  let resetAt: Date | undefined;
  if (resetRaw !== null) {
    const resetNum = parseInt(resetRaw, 10);
    if (!isNaN(resetNum)) {
      // Could be Unix timestamp (seconds) or milliseconds
      resetAt = resetNum > 1e10 ? new Date(resetNum) : new Date(resetNum * 1000);
    }
  }

  return { remaining, resetAt };
}

export async function resilientFetch(
  url: string,
  options: RequestInit,
  retryOptions?: RetryOptions,
): Promise<Response> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...retryOptions };
  let attempt = 0;
  let delayMs = opts.initialDelayMs;

  while (true) {
    attempt++;
    console.log(`[resilient-fetch] Attempt ${attempt}: ${options.method ?? 'GET'} ${url}`);

    let response: Response;
    try {
      response = await fetch(url, options);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[resilient-fetch] Network error: ${msg}`);
      if (attempt > opts.maxRetries) throw err;
      console.log(`[resilient-fetch] Retrying in ${delayMs}ms...`);
      await sleep(delayMs);
      delayMs = Math.min(delayMs * 2, opts.maxDelayMs);
      continue;
    }

    console.log(`[resilient-fetch] Response status: ${response.status}`);

    // Log rate limit headers
    const { remaining, resetAt } = parseRateLimitHeaders(response.headers);
    if (remaining !== undefined) {
      const nowMs = Date.now();
      const resetMs = resetAt?.getTime();
      const waitSecs =
        resetMs !== undefined && resetMs > nowMs
          ? Math.ceil((resetMs - nowMs) / 1000)
          : undefined;
      console.log(
        `[resilient-fetch] Rate limit: ${remaining} remaining, resets at ${resetAt?.toISOString() ?? 'unknown'}${waitSecs !== undefined ? ` (${waitSecs}s)` : ''}`,
      );
    }

    // Handle retryable status codes
    if (opts.retryOnStatus.includes(response.status)) {
      if (attempt > opts.maxRetries) {
        console.error(`[resilient-fetch] Max retries (${opts.maxRetries}) exceeded on status ${response.status}`);
        return response;
      }

      let waitMs = delayMs;

      if (response.status === 429) {
        // Check Retry-After header
        const retryAfter = response.headers.get('Retry-After');
        if (retryAfter !== null) {
          const seconds = parseFloat(retryAfter);
          if (!isNaN(seconds)) {
            waitMs = Math.ceil(seconds * 1000);
          }
        } else if (resetAt !== undefined && resetAt.getTime() > Date.now()) {
          waitMs = resetAt.getTime() - Date.now() + 100;
        }
      }

      console.log(`[resilient-fetch] Status ${response.status} — waiting ${Math.ceil(waitMs / 1000)}s before retry...`);
      await sleep(waitMs);
      delayMs = Math.min(delayMs * 2, opts.maxDelayMs);
      continue;
    }

    // After success, check if rate limit is exhausted — wait before returning
    if (remaining !== undefined && remaining === 0 && resetAt !== undefined) {
      const nowMs = Date.now();
      const waitMs = resetAt.getTime() - nowMs;
      if (waitMs > 0) {
        console.log(`[resilient-fetch] Rate limit exhausted. Waiting ${Math.ceil(waitMs / 1000)}s until reset at ${resetAt.toISOString()}...`);
        await sleep(waitMs + 100);
        console.log('[resilient-fetch] Rate limit reset. Continuing...');
      }
    }

    return response;
  }
}
