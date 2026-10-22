import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { id } = await params;
  const job = await prisma.recoveryJob.findFirst({
    where: { id, userId: session.user.id },
    include: { file: true, result: true },
  });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  return NextResponse.json({
    id: job.id,
    status: job.status,
    mode: job.mode,
    progress: job.progress,
    candidatesTried: job.candidatesTried,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt,
    file: { originalName: job.file.originalName, format: job.file.detectedFormat, sizeBytes: job.file.sizeBytes },
    result: job.result ? { password: job.result.password, strategy: job.result.strategy } : null,
  });
}
