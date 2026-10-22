import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateUpload, sha256 } from "@/lib/security/fileValidation";
import { rateLimit, clientIp } from "@/lib/security/rateLimit";
import { audit } from "@/lib/security/audit";
import { getLimit } from "@/lib/limits";
import { strategiesForMode, type RecoveryHints } from "@/lib/recovery/strategies";
import { loadZipCryptoTarget, verifyPassword } from "@/lib/analyzers/zipcrypto";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

// Wall-clock budget for the synchronous online attempt; large/exhaustive runs
// are a local-worker concern, not a serverless one.
const ONLINE_BUDGET_MS = 45_000;

const hintsSchema = z
  .object({ knownWords: z.array(z.string().max(64)).max(20).optional() })
  .optional();

/**
 * Self-contained recovery for the hosted deployment: it verifies candidate
 * passwords for traditional-PKWARE ZIP files entirely in-process (no worker,
 * no Redis, no CLI binary), within a single request. Other formats are
 * reported as local-only rather than attempted here. A candidate is only ever
 * returned after a full verified decrypt (see lib/analyzers/zipcrypto).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const userId = session.user.id;
  const ip = clientIp(req.headers);

  const { allowed } = await rateLimit(`online-recover:${userId}`, 15, 60 * 10);
  if (!allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  const mode = form.get("mode") === "DEEP_RECOVERY" ? "DEEP_RECOVERY" : "FAST_CHECK";
  const rawHints = form.get("hints");
  const parsedHints = hintsSchema.safeParse(rawHints ? JSON.parse(String(rawHints)) : undefined);
  const hints: RecoveryHints = parsedHints.success && parsedHints.data ? parsedHints.data : {};

  const maxSize = await getLimit("MAX_FILE_SIZE");
  const buf = Buffer.from(await file.arrayBuffer());
  const validation = validateUpload(buf, file.name, maxSize);
  if (!validation.ok) {
    await audit({ userId, action: "UPLOAD_REJECTED", entityType: "File", metadata: { reason: validation.reason }, ip });
    return NextResponse.json({ error: validation.reason }, { status: 400 });
  }

  const fileId = uuidv4();
  await prisma.file.create({
    data: {
      id: fileId,
      userId,
      objectKey: `online/${fileId}`,
      originalName: file.name,
      sizeBytes: buf.length,
      sha256: sha256(buf),
      mimeType: file.type || "application/octet-stream",
      detectedFormat: validation.format,
      expiresAt: new Date(Date.now() + (await getLimit("FILE_RETENTION_MS"))),
    },
  });
  const job = await prisma.recoveryJob.create({
    data: { userId, fileId, mode, status: "RUNNING", hints: hints as object, startedAt: new Date() },
  });
  await audit({ userId, action: "ONLINE_RECOVERY_STARTED", entityType: "RecoveryJob", entityId: job.id, ip, metadata: { format: validation.format, mode } });

  // Non-ZIP formats are handled by the local worker (qpdf / office / 7z);
  // report that honestly instead of guessing here.
  if (validation.format !== "ZIP") {
    await prisma.recoveryJob.update({ where: { id: job.id }, data: { status: "UNSUPPORTED", finishedAt: new Date() } });
    return NextResponse.json({
      jobId: job.id,
      format: validation.format,
      localOnly: true,
      message: `${validation.format} recovery runs in the local VaultRecover worker (qpdf / Office / 7-Zip). Clone the repo and run it locally for this format.`,
    });
  }

  const tmpPath = path.join(os.tmpdir(), `${fileId}.zip`);
  await fs.writeFile(tmpPath, buf);
  const startedAt = Date.now();
  let candidatesTried = 0;

  try {
    const target = await loadZipCryptoTarget(tmpPath);
    if (!target) {
      await prisma.recoveryJob.update({ where: { id: job.id }, data: { status: "UNSUPPORTED", finishedAt: new Date() } });
      return NextResponse.json({
        jobId: job.id,
        format: "ZIP",
        localOnly: true,
        message: "This ZIP is unencrypted, or uses WinZip AES. The online engine verifies traditional (ZipCrypto) ZIPs; AES ZIPs recover in the local worker.",
      });
    }

    const deadline = startedAt + Math.min(ONLINE_BUDGET_MS, (await getLimit("MAX_JOB_RUNTIME_MS")) || ONLINE_BUDGET_MS);
    for (const strategy of strategiesForMode(mode)) {
      for (const candidate of strategy.candidates(hints)) {
        if (Date.now() > deadline) {
          await finish(job.id, "FAILED", candidatesTried, startedAt);
          return NextResponse.json({ jobId: job.id, format: "ZIP", success: false, candidatesTried, exhausted: false });
        }
        candidatesTried++;
        if (verifyPassword(target, candidate)) {
          await prisma.$transaction([
            prisma.recoveryResult.create({ data: { jobId: job.id, password: candidate, strategy: strategy.name } }),
            prisma.recoveryJob.update({
              where: { id: job.id },
              data: { status: "RECOVERED", candidatesTried, finishedAt: new Date(), runtimeMs: Date.now() - startedAt, progress: 100 },
            }),
          ]);
          await audit({ userId, action: "ONLINE_RECOVERY_SUCCESS", entityType: "RecoveryJob", entityId: job.id, ip, metadata: { strategy: strategy.name, candidatesTried } });
          logger.info({ jobId: job.id, candidatesTried }, "online recovery success");
          return NextResponse.json({ jobId: job.id, format: "ZIP", success: true, password: candidate, strategy: strategy.name, candidatesTried });
        }
      }
    }
    await finish(job.id, "FAILED", candidatesTried, startedAt);
    return NextResponse.json({ jobId: job.id, format: "ZIP", success: false, candidatesTried, exhausted: true });
  } catch (err) {
    logger.error({ err, jobId: job.id }, "online recovery error");
    await prisma.recoveryJob.update({ where: { id: job.id }, data: { status: "FAILED", finishedAt: new Date(), errorMessage: "recovery error" } });
    return NextResponse.json({ error: "Recovery failed" }, { status: 500 });
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }
}

async function finish(jobId: string, status: "FAILED", candidatesTried: number, startedAt: number) {
  await prisma.recoveryJob.update({
    where: { id: jobId },
    data: { status, candidatesTried, finishedAt: new Date(), runtimeMs: Date.now() - startedAt },
  });
}
