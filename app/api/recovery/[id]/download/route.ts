import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { verifySignedToken } from "@/lib/security/signedUrl";
import { audit } from "@/lib/security/audit";
import { clientIp } from "@/lib/security/rateLimit";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const verified = verifySignedToken(token);
  if (!verified) return NextResponse.json({ error: "Invalid or expired download link" }, { status: 403 });

  const download = await prisma.download.findUnique({
    where: { id: verified.downloadId },
    include: { job: { include: { result: true, file: true } } },
  });
  if (!download || download.job.id !== id) {
    return NextResponse.json({ error: "Invalid download" }, { status: 403 });
  }
  if (download.expiresAt < new Date()) {
    return NextResponse.json({ error: "Download link has expired" }, { status: 403 });
  }
  if (download.job.status !== "RECOVERED" || !download.job.result?.resultObjectKey) {
    return NextResponse.json({ error: "No recovered file available" }, { status: 400 });
  }

  const exists = await storage.exists(download.job.result.resultObjectKey);
  if (!exists) {
    return NextResponse.json({ error: "File has been cleaned up and is no longer available" }, { status: 410 });
  }

  const buf = await storage.get(download.job.result.resultObjectKey);

  await prisma.download.update({ where: { id: download.id }, data: { downloadedAt: new Date() } });
  await audit({
    userId: download.job.userId,
    action: "FILE_DOWNLOADED",
    entityType: "RecoveryJob",
    entityId: download.job.id,
    ip: clientIp(req.headers),
  });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="unlocked-${download.job.file.originalName}"`,
      "Content-Length": String(buf.length),
    },
  });
}
