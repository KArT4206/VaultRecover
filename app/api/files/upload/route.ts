import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { storage, newObjectKey } from "@/lib/storage";
import { validateUpload, sha256, extOf } from "@/lib/security/fileValidation";
import { rateLimit, clientIp } from "@/lib/security/rateLimit";
import { audit, scanForMalware } from "@/lib/security/audit";
import { getLimit } from "@/lib/limits";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const userId = session.user.id;
  const ip = clientIp(req.headers);

  const { allowed } = await rateLimit(`upload:${userId}`, 20, 60 * 10);
  if (!allowed) {
    return NextResponse.json({ error: "Too many uploads. Slow down and try again shortly." }, { status: 429 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const maxSize = await getLimit("MAX_FILE_SIZE");
  const arrayBuffer = await file.arrayBuffer();
  const buf = Buffer.from(arrayBuffer);

  const validation = validateUpload(buf, file.name, maxSize);
  if (!validation.ok) {
    await audit({ userId, action: "UPLOAD_REJECTED", entityType: "File", metadata: { reason: validation.reason }, ip });
    return NextResponse.json({ error: validation.reason }, { status: 400 });
  }

  const scan = await scanForMalware(buf);
  if (!scan.clean) {
    return NextResponse.json({ error: "File failed security scan" }, { status: 400 });
  }

  const fileId = uuidv4();
  const objectKey = newObjectKey("uploads", fileId, extOf(file.name));
  await storage.put(objectKey, buf);

  const retentionMs = await getLimit("FILE_RETENTION_MS");

  const record = await prisma.file.create({
    data: {
      id: fileId,
      userId,
      objectKey,
      originalName: file.name,
      sizeBytes: buf.length,
      sha256: sha256(buf),
      mimeType: file.type || "application/octet-stream",
      detectedFormat: validation.format,
      expiresAt: new Date(Date.now() + retentionMs),
    },
  });

  await audit({ userId, action: "FILE_UPLOADED", entityType: "File", entityId: record.id, ip, metadata: { format: validation.format, size: buf.length } });
  logger.info({ fileId: record.id, format: validation.format }, "file uploaded");

  return NextResponse.json({
    fileId: record.id,
    format: validation.format,
    sizeBytes: record.sizeBytes,
    sha256: record.sha256,
  });
}
