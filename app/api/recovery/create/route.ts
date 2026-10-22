import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { analyzeFile } from "@/lib/analyzers";
import { getRecoveryQueue } from "@/lib/queue";
import { rateLimit, clientIp } from "@/lib/security/rateLimit";
import { audit } from "@/lib/security/audit";
import { getLimit } from "@/lib/limits";

const schema = z.object({
  fileId: z.string().uuid(),
  mode: z.enum(["FAST_CHECK", "DEEP_RECOVERY", "LEGACY"]).default("FAST_CHECK"),
  hints: z
    .object({
      knownWords: z.array(z.string().max(64)).max(20).optional(),
      minLength: z.number().min(1).max(12).optional(),
      maxLength: z.number().min(1).max(12).optional(),
    })
    .optional(),
});

const RECOVERABLE_FORMATS = new Set(["PDF", "ZIP", "SEVEN_Z", "WORD", "EXCEL", "POWERPOINT"]);

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const userId = session.user.id;
  const ip = clientIp(req.headers);

  const { allowed } = await rateLimit(`job-create:${userId}`, 15, 60 * 10);
  if (!allowed) {
    return NextResponse.json({ error: "Too many job creation attempts. Try again shortly." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const file = await prisma.file.findFirst({ where: { id: parsed.data.fileId, userId, deletedAt: null } });
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const activeCount = await prisma.recoveryJob.count({
    where: { userId, status: { in: ["PENDING", "ANALYZING", "QUEUED", "RUNNING"] } },
  });
  const maxActive = await getLimit("MAX_ACTIVE_JOBS_PER_USER");
  if (activeCount >= maxActive) {
    return NextResponse.json({ error: `You have reached the limit of ${maxActive} active jobs. Wait for one to finish.` }, { status: 429 });
  }

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dailyCount = await prisma.recoveryJob.count({ where: { userId, createdAt: { gte: dayStart } } });
  const maxDaily = await getLimit("MAX_DAILY_JOBS");
  if (dailyCount >= maxDaily) {
    return NextResponse.json({ error: `Daily job limit (${maxDaily}) reached. Try again tomorrow.` }, { status: 429 });
  }

  if (!RECOVERABLE_FORMATS.has(file.detectedFormat)) {
    const job = await prisma.recoveryJob.create({
      data: {
        userId,
        fileId: file.id,
        mode: parsed.data.mode,
        status: "UNSUPPORTED",
        hints: parsed.data.hints,
        errorMessage: `${file.detectedFormat} recovery is not yet supported for automated execution.`,
      },
    });
    return NextResponse.json({ jobId: job.id, status: job.status });
  }

  const localPath = await storage.getLocalPath(file.objectKey);
  const analysis = await analyzeFile(file.detectedFormat, localPath);

  await prisma.fileAnalysis.upsert({
    where: { fileId: file.id },
    create: {
      fileId: file.id,
      format: analysis.format as never,
      isEncrypted: analysis.isEncrypted,
      encryptionType: analysis.encryptionType,
      entryCount: analysis.entryCount,
      uncompressedSize: analysis.uncompressedSize ? BigInt(analysis.uncompressedSize) : undefined,
      recoverySupported: analysis.recoverySupported,
      details: analysis.details as never,
    },
    update: {
      isEncrypted: analysis.isEncrypted,
      encryptionType: analysis.encryptionType,
      entryCount: analysis.entryCount,
      uncompressedSize: analysis.uncompressedSize ? BigInt(analysis.uncompressedSize) : undefined,
      recoverySupported: analysis.recoverySupported,
      details: analysis.details as never,
    },
  });

  if (!analysis.isEncrypted) {
    const job = await prisma.recoveryJob.create({
      data: {
        userId,
        fileId: file.id,
        mode: parsed.data.mode,
        status: "FAILED",
        hints: parsed.data.hints,
        errorMessage: "This file does not appear to be password-protected.",
      },
    });
    return NextResponse.json({ jobId: job.id, status: job.status });
  }

  if (!analysis.recoverySupported) {
    const job = await prisma.recoveryJob.create({
      data: {
        userId,
        fileId: file.id,
        mode: parsed.data.mode,
        status: "UNSUPPORTED",
        hints: parsed.data.hints,
        errorMessage: analysis.details?.rejected
          ? String(analysis.details.rejected)
          : "This file could not be safely analyzed for automated recovery.",
      },
    });
    return NextResponse.json({ jobId: job.id, status: job.status });
  }

  const job = await prisma.recoveryJob.create({
    data: {
      userId,
      fileId: file.id,
      mode: parsed.data.mode,
      status: "QUEUED",
      hints: parsed.data.hints,
    },
  });

  await getRecoveryQueue().add("recover", { jobId: job.id }, { jobId: job.id });
  await audit({ userId, action: "JOB_CREATED", entityType: "RecoveryJob", entityId: job.id, ip, metadata: { mode: parsed.data.mode } });

  return NextResponse.json({ jobId: job.id, status: job.status });
}
