import IORedis from "ioredis";

const globalForRedis = globalThis as unknown as { redis?: IORedis };

export function getRedis(): IORedis {
  if (!globalForRedis.redis) {
    globalForRedis.redis = new IORedis(
      process.env.REDIS_URL || "redis://localhost:6379",
      { maxRetriesPerRequest: null }
    );
  }
  return globalForRedis.redis;
}
