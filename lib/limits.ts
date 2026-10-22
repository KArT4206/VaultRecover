import { prisma } from "@/lib/prisma";

/**
 * Usage limits. Defaults come from env; a SystemSetting row (if present)
 * overrides the default at runtime, so limits can be tuned later from an
 * admin UI without a redeploy.
 */
export const DEFAULT_LIMITS = {
  MAX_FILE_SIZE: Number(process.env.MAX_FILE_SIZE || 100 * 1024 * 1024), // 100MB
  MAX_ACTIVE_JOBS_PER_USER: Number(process.env.MAX_ACTIVE_JOBS_PER_USER || 3),
  MAX_DAILY_JOBS: Number(process.env.MAX_DAILY_JOBS || 20),
  MAX_JOB_RUNTIME_MS: Number(process.env.MAX_JOB_RUNTIME || 5 * 60 * 1000), // 5 min
  FILE_RETENTION_MS: Number(process.env.FILE_RETENTION_MS || 24 * 60 * 60 * 1000), // 24h
} as const;

export type LimitKey = keyof typeof DEFAULT_LIMITS;

export async function getLimit(key: LimitKey): Promise<number> {
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key } });
    if (row) {
      const parsed = Number(row.value);
      if (!Number.isNaN(parsed)) return parsed;
    }
  } catch {
    // DB unavailable at import time (e.g. during build) — fall back to default.
  }
  return DEFAULT_LIMITS[key];
}
