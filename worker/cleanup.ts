import "dotenv/config";
import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import { storage } from "../lib/storage";
import { logger } from "../lib/logger";

const prisma = new PrismaClient();

/**
 * Deletes expired files (past File.expiresAt) from storage and marks them
 * deleted, and deletes recovered-result objects whose job is old enough.
 * Runs on a schedule; also exported as `runCleanupOnce` for tests / manual
 * invocation with a short retention window during verification.
 */
export async function runCleanupOnce(): Promise<{ filesDeleted: number; resultsDeleted: number }> {
  const now = new Date();
  let filesDeleted = 0;
  let resultsDeleted = 0;

  const expiredFiles = await prisma.file.findMany({
    where: { deletedAt: null, expiresAt: { lt: now } },
  });
  for (const file of expiredFiles) {
    await storage.delete(file.objectKey);
    await prisma.file.update({ where: { id: file.id }, data: { deletedAt: now } });
    await prisma.auditLog.create({
      data: { userId: file.userId, action: "FILE_EXPIRED_CLEANUP", entityType: "File", entityId: file.id },
    });
    filesDeleted++;
  }

  const expiredResults = await prisma.recoveryResult.findMany({
    where: {
      resultObjectKey: { not: null },
      job: { finishedAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
    },
  });
  for (const result of expiredResults) {
    if (!result.resultObjectKey) continue;
    await storage.delete(result.resultObjectKey);
    await prisma.recoveryResult.update({ where: { id: result.id }, data: { resultObjectKey: null } });
    resultsDeleted++;
  }

  logger.info({ filesDeleted, resultsDeleted }, "cleanup pass complete");
  return { filesDeleted, resultsDeleted };
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  cron.schedule("*/15 * * * *", () => {
    runCleanupOnce().catch((err) => logger.error({ err }, "cleanup pass failed"));
  });
  logger.info("VaultRecover cleanup scheduler started (every 15 minutes)");
  runCleanupOnce().catch((err) => logger.error({ err }, "initial cleanup pass failed"));
}
