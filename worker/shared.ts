import { Worker, type Job } from "bullmq";
import { v4 as uuidv4 } from "uuid";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { PrismaClient } from "@prisma/client";
import IORedis from "ioredis";
import { storage, newObjectKey } from "../lib/storage";
import { runRecovery } from "../lib/recovery/provider";
import { RECOVERY_QUEUE_NAME, progressChannel, type RecoveryJobData } from "../lib/queue";
import { getLimit } from "../lib/limits";
import { logger } from "../lib/logger";
import { probeGpu } from "../lib/gpu";

export type WorkerKind = "CPU" | "GPU";

/**
 * Shared job-processing logic for both the CPU and GPU worker entrypoints.
 * The actual candidate-verification calls (qpdf/unzip/7z/msoffcrypto) are
 * identical regardless of `kind` — nothing about them is GPU-accelerated
 * today. `kind` only affects: which BullMQ concurrency setting is used,
 * and what gets reported in this process's `Worker` heartbeat row so the
 * admin dashboard can show real worker identity — it never changes what
 * "recovered" means or fabricates a faster/different code path.
 */
export async function runWorkerProcess(kind: WorkerKind) {
  const prisma = new PrismaClient();
  const redis = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", { maxRetriesPerRequest: null });
  const publisher = new IORedis(process.env.REDIS_URL || "redis://localhost:6379");
  const workerId = uuidv4();
  const hostname = os.hostname();

  async function publish(jobId: string, payload: Record<string, unknown>) {
    await publisher.publish(progressChannel(jobId), JSON.stringify(payload));
  }

  // Real hardware probe, run once at startup. hasGpu reflects actual
  // detected hardware (even a CPU-kind worker reports the truth about the
  // host it's running on); accelerationAvailable reflects whether a real
  // GPU-cracking tool (hashcat) is present to actually use it — this
  // worker's own candidate verification never depends on either flag.
  const gpu = await probeGpu();

  await prisma.worker.upsert({
    where: { id: workerId },
    create: {
      id: workerId,
      hostname,
      kind,
      hasGpu: gpu.hasGpu,
      gpuInfo: gpu.info,
      status: "idle",
    },
    update: { hostname, kind, hasGpu: gpu.hasGpu, gpuInfo: gpu.info, status: "idle" },
  });

  const heartbeatTimer = setInterval(() => {
    prisma.worker
      .update({ where: { id: workerId }, data: { lastHeartbeat: new Date() } })
      .catch(() => {});
  }, 15_000);

  async function processJob(bullJob: Job<RecoveryJobData>) {
    const { jobId } = bullJob.data;
    const job = await prisma.recoveryJob.findUnique({ where: { id: jobId }, include: { file: true } });
    if (!job) {
      logger.warn({ jobId }, "job not found, skipping");
      return;
    }
    if (job.status === "CANCELLED") return;

    await prisma.worker
      .update({ where: { id: workerId }, data: { status: "busy", activeJobId: jobId } })
      .catch(() => {});

    const maxRuntimeMs = await getLimit("MAX_JOB_RUNTIME_MS");
    const startedAt = new Date();

    await prisma.recoveryJob.update({
      where: { id: jobId },
      data: { status: "RUNNING", startedAt, progress: 1, workerId },
    });
    await publish(jobId, { event: "status", status: "RUNNING", progress: 1, candidatesTried: 0 });

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "vaultrecover-"));
    try {
      const inputPath = path.join(tmpDir, "input");
      const inputBuf = await storage.get(job.file.objectKey);
      await fs.writeFile(inputPath, inputBuf);
      const outPath = path.join(tmpDir, "output");

      const format = job.file.detectedFormat as "PDF" | "ZIP" | "SEVEN_Z" | "WORD" | "EXCEL" | "POWERPOINT";
      const hints = (job.hints as { knownWords?: string[]; minLength?: number; maxLength?: number } | null) ?? {};

      const outcome = await runRecovery({
        format,
        filePath: inputPath,
        mode: job.mode as "FAST_CHECK" | "DEEP_RECOVERY" | "LEGACY",
        hints,
        outPath,
        maxRuntimeMs,
        onProgress: async (candidatesTried, strategy) => {
          const progress = Math.min(95, 5 + candidatesTried);
          await prisma.recoveryJob
            .update({ where: { id: jobId }, data: { progress, candidatesTried } })
            .catch(() => {});
          await publish(jobId, { event: "progress", progress, candidatesTried, strategy });
        },
        shouldAbort: async () => {
          const cancelled = await redis.get(`recovery:cancel:${jobId}`);
          return cancelled === "1";
        },
      });

      if (outcome.success && outcome.password) {
        let resultObjectKey: string | undefined;

        if (format === "PDF") {
          const outBuf = await fs.readFile(outPath);
          resultObjectKey = newObjectKey("results", uuidv4(), "pdf");
          await storage.put(resultObjectKey, outBuf);
        } else if (format === "ZIP") {
          resultObjectKey = newObjectKey("results", uuidv4(), "zip");
          await storage.put(resultObjectKey, inputBuf);
        } else if (format === "SEVEN_Z") {
          resultObjectKey = newObjectKey("results", uuidv4(), "7z");
          await storage.put(resultObjectKey, inputBuf);
        } else {
          const ext = format === "WORD" ? "docx" : format === "EXCEL" ? "xlsx" : "pptx";
          const outBuf = await fs.readFile(outPath);
          resultObjectKey = newObjectKey("results", uuidv4(), ext);
          await storage.put(resultObjectKey, outBuf);
        }

        await prisma.recoveryResult.create({
          data: {
            jobId,
            password: outcome.password,
            strategy: outcome.strategy ?? "unknown",
            resultObjectKey,
          },
        });
        await prisma.recoveryJob.update({
          where: { id: jobId },
          data: {
            status: "RECOVERED",
            progress: 100,
            candidatesTried: outcome.candidatesTried,
            finishedAt: new Date(),
            runtimeMs: Date.now() - startedAt.getTime(),
          },
        });
        await publish(jobId, { event: "done", status: "RECOVERED" });
        logger.info({ jobId, strategy: outcome.strategy, workerKind: kind }, "recovery succeeded");
      } else {
        const cancelled = (await redis.get(`recovery:cancel:${jobId}`)) === "1";
        const finalStatus = cancelled ? "CANCELLED" : "FAILED";
        await prisma.recoveryJob.update({
          where: { id: jobId },
          data: {
            status: finalStatus,
            candidatesTried: outcome.candidatesTried,
            finishedAt: new Date(),
            runtimeMs: Date.now() - startedAt.getTime(),
            errorMessage: cancelled
              ? "Cancelled by user."
              : "No candidate password recovered the file within the available strategies.",
          },
        });
        await publish(jobId, { event: "done", status: finalStatus });
        logger.info(
          { jobId, finalStatus, candidatesTried: outcome.candidatesTried, workerKind: kind },
          "recovery ended without success"
        );
      }
    } catch (err) {
      logger.error({ err, jobId }, "recovery job errored");
      await prisma.recoveryJob.update({
        where: { id: jobId },
        data: { status: "FAILED", finishedAt: new Date(), errorMessage: "Internal error during recovery." },
      });
      await publish(jobId, { event: "done", status: "FAILED" });
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
      await prisma.worker
        .update({ where: { id: workerId }, data: { status: "idle", activeJobId: null } })
        .catch(() => {});
    }
  }

  const defaultConcurrency = kind === "GPU" ? 1 : 2;
  const worker = new Worker<RecoveryJobData>(RECOVERY_QUEUE_NAME, processJob, {
    connection: redis,
    concurrency: Number(process.env.WORKER_CONCURRENCY || defaultConcurrency),
  });

  worker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.data.jobId }, "bullmq job failed");
  });

  logger.info(
    { kind, hostname, hasGpu: gpu.hasGpu, gpuInfo: gpu.info },
    `VaultRecover ${kind} worker started, listening for recovery jobs`
  );

  process.on("SIGTERM", async () => {
    clearInterval(heartbeatTimer);
    await worker.close();
    await prisma.worker.update({ where: { id: workerId }, data: { status: "offline" } }).catch(() => {});
    process.exit(0);
  });
}
