import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { audit } from "@/lib/security/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { id } = await params;
  const job = await prisma.recoveryJob.findFirst({ where: { id, userId: session.user.id } });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  if (!["PENDING", "ANALYZING", "QUEUED", "RUNNING"].includes(job.status)) {
    return NextResponse.json({ error: "Job is not cancellable in its current state" }, { status: 400 });
  }

  await prisma.recoveryJob.update({ where: { id: job.id }, data: { status: "CANCELLED", finishedAt: new Date() } });
  await getRedis().set(`recovery:cancel:${job.id}`, "1", "EX", 3600);
  await audit({ userId: session.user.id, action: "JOB_CANCELLED", entityType: "RecoveryJob", entityId: job.id });

  return NextResponse.json({ ok: true });
}
