import { LocalDiskProvider } from "./local";
import type { StorageProvider } from "./types";

export type { StorageProvider } from "./types";
export { newObjectKey } from "./types";

/**
 * Storage driver switch. STORAGE_DRIVER=s3 would load an S3Provider here
 * (aws-sdk client pointed at S3/R2/MinIO using the same StorageProvider
 * interface) — not implemented in this pass since local disk + MinIO's
 * S3-compatible API cover the MVP, but the seam is here.
 */
function createStorage(): StorageProvider {
  const driver = process.env.STORAGE_DRIVER || "local";
  if (driver === "local") return new LocalDiskProvider();
  throw new Error(`Unsupported STORAGE_DRIVER: ${driver} (only "local" implemented in MVP)`);
}

export const storage = createStorage();
