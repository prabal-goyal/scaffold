// A sliding-window rate limiter held in process memory.
//
// Deliberate limitation: this state lives in one server instance. On a
// serverless platform each instance keeps its own counters and a cold start
// clears them, so a determined caller spreading requests across instances gets
// more than the nominal limit. It is a speed bump against casual abuse of the
// paid OpenAI routes, not a guarantee. A shared store (Redis) is the upgrade
// path if the limit ever needs to be enforceable rather than merely useful.

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

const hits = new Map<string, number[]>();

// Without pruning, one entry accumulates per distinct key for the process
// lifetime. Cleanup runs only when the map is large enough to be worth it.
const PRUNE_THRESHOLD = 10_000;

function prune(now: number, windowMs: number): void {
  for (const [key, timestamps] of hits) {
    const live = timestamps.filter((t) => now - t < windowMs);
    if (live.length === 0) {
      hits.delete(key);
    } else {
      hits.set(key, live);
    }
  }
}

/**
 * Records an attempt against `key` and reports whether it is allowed.
 *
 * @param now injectable clock — tests advance time instead of sleeping.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now()
): RateLimitResult {
  if (hits.size > PRUNE_THRESHOLD) {
    prune(now, windowMs);
  }

  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);

  if (recent.length >= limit) {
    hits.set(key, recent);
    // The window frees up when the oldest recorded hit falls out of it.
    const msUntilFree = windowMs - (now - recent[0]);
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(msUntilFree / 1000)) };
  }

  recent.push(now);
  hits.set(key, recent);
  return { ok: true };
}

/** Test seam — clears all recorded state. */
export function resetRateLimits(): void {
  hits.clear();
}
