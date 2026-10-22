import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRecoveryQueue } from "@/lib/queue";

/**
 * Jobs are auto-queued on /api/recovery/create. This endpoint exists for
 * re-starting a job stuck in PENDING (e.g. after a worker restart) without
 * re-uploading the file.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { id } = await params;
  const job = await prisma.recoveryJob.findFirst({ where: { id, userId: session.user.id } });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (job.status !== "PENDING") {
    return NextResponse.json({ error: "Only PENDING jobs can be (re)started" }, { status: 400 });
  }

  await prisma.recoveryJob.update({ where: { id: job.id }, data: { status: "QUEUED" } });
  await getRecoveryQueue().add("recover", { jobId: job.id }, { jobId: `${job.id}-restart-${Date.now()}` });

  return NextResponse.json({ ok: true });
}
