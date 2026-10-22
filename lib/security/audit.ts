import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function audit(params: {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        metadata: params.metadata as never,
        ip: params.ip,
      },
    });
  } catch (err) {
    logger.error({ err, params }, "failed to write audit log");
  }
}

/** Stub for future automated malware scanning of uploads. Not implemented in MVP. */
export async function scanForMalware(buf: Buffer): Promise<{ clean: boolean }> {
  // TODO: integrate ClamAV or a hosted scanning API before enabling
  // untrusted multi-tenant uploads at scale.
  void buf;
  return { clean: true };
}
