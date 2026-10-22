import { getRedis } from "@/lib/redis";

/**
 * Fixed-window rate limiter. Backed by Redis when REDIS_URL is set (shared
 * across web instances); otherwise an in-process fallback, which is enough for
 * a single-instance or serverless deployment that has no Redis. Either way the
 * limiter fails open (logged) rather than taking the whole app down.
 */
const memoryBuckets = new Map<string, { count: number; expiresAt: number }>();

function memoryLimit(key: string, limit: number, windowSeconds: number) {
  const now = Date.now();
  const bucketKey = `${key}:${Math.floor(now / 1000 / windowSeconds)}`;
  const existing = memoryBuckets.get(bucketKey);
  const bucket =
    existing && existing.expiresAt > now
      ? existing
      : { count: 0, expiresAt: now + windowSeconds * 1000 };
  bucket.count += 1;
  memoryBuckets.set(bucketKey, bucket);
  if (memoryBuckets.size > 10_000) {
    for (const [k, v] of memoryBuckets) if (v.expiresAt <= now) memoryBuckets.delete(k);
  }
  return { allowed: bucket.count <= limit, remaining: Math.max(0, limit - bucket.count) };
}

export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  if (!process.env.REDIS_URL) {
    return memoryLimit(key, limit, windowSeconds);
  }
  try {
    const redis = getRedis();
    const bucketKey = `ratelimit:${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
    const count = await redis.incr(bucketKey);
    if (count === 1) await redis.expire(bucketKey, windowSeconds);
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  } catch {
    return { allowed: true, remaining: limit };
  }
}

export function clientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}
