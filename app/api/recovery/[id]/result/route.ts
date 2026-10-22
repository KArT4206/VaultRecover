import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createSignedToken } from "@/lib/security/signedUrl";
import { getLimit } from "@/lib/limits";

const DOWNLOAD_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { id } = await params;
  const job = await prisma.recoveryJob.findFirst({
    where: { id, userId: session.user.id },
    include: { result: true, file: true },
  });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (job.status !== "RECOVERED" || !job.result) {
    return NextResponse.json({ error: "Job has no recovered result" }, { status: 400 });
  }

  const downloadToken = uuidv4();
  await getLimit("MAX_FILE_SIZE"); // touch limits module to keep it warm; retention below
  const download = await prisma.download.create({
    data: {
      jobId: job.id,
      token: downloadToken,
      expiresAt: new Date(Date.now() + DOWNLOAD_TTL_MS),
    },
  });

  const signed = createSignedToken(download.id, DOWNLOAD_TTL_MS);

  return NextResponse.json({
    password: job.result.password,
    strategy: job.result.strategy,
    originalName: job.file.originalName,
    downloadUrl: `/api/recovery/${job.id}/download?token=${signed}`,
  });
}
