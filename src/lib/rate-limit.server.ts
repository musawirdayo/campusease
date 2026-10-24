// In-memory sliding-window rate limiter for the public server routes.
//
// Deliberately simple: one process, one map. It protects against casual
// abuse and runaway loops (the realistic threat for a student-made tool);
// a global distributed limiter isn't needed at this scale. Serverless
// restarts reset the buckets — worst case an attacker overcounts by one
// window's worth.
type Bucket = number[]; // hit timestamps (ms)

const buckets = new Map<string, Bucket>();

/** Absorb one hit for `key`; false when `limit` hits within `windowMs` are
 *  already on the books, with a retry delay. */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  buckets.set(key, hits);
  if (hits.length >= limit)
    return {
      ok: false,
      retryAfter: Math.ceil((windowMs - (now - hits[0]!)) / 1000),
    };
  hits.push(now);
  // crude memory guard: sweep fully-forgotten keys once in a while
  if (buckets.size > 10_000)
    for (const [k, arr] of buckets)
      if (!arr.length || now - arr[arr.length - 1]! > windowMs)
        buckets.delete(k);
  return { ok: true, retryAfter: 0 };
}

/** First hop of the client chain (the edge proxy is trusted to set this). */
export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return request.headers.get("cf-connecting-ip") ?? "unknown";
}
