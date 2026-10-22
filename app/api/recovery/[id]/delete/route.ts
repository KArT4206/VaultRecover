import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { audit } from "@/lib/security/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { id } = await params;
  const job = await prisma.recoveryJob.findFirst({
    where: { id, userId: session.user.id },
    include: { file: true, result: true },
  });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  if (job.result?.resultObjectKey) await storage.delete(job.result.resultObjectKey);
  await storage.delete(job.file.objectKey);
  await prisma.file.update({ where: { id: job.file.id }, data: { deletedAt: new Date() } });
  await prisma.recoveryJob.delete({ where: { id: job.id } });

  await audit({ userId: session.user.id, action: "JOB_DELETED", entityType: "RecoveryJob", entityId: id });

  return NextResponse.json({ ok: true });
}
