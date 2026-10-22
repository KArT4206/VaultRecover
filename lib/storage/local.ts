import fs from "node:fs/promises";
import path from "node:path";
import type { StorageProvider } from "./types";

const ROOT = process.env.STORAGE_LOCAL_ROOT || path.join(process.cwd(), "storage");

/**
 * Disk-backed StorageProvider with an S3-compatible key layout
 * (`<bucket-prefix>/<uuid>.<ext>`), so swapping in a real S3/R2/MinIO
 * provider later requires no caller changes.
 */
export class LocalDiskProvider implements StorageProvider {
  private resolve(key: string): string {
    // Defense in depth against path traversal even though keys are
    // always server-generated UUIDs (never user-supplied names).
    const normalized = path.normalize(key).replace(/^(\.\.[/\\])+/, "");
    const resolvedRoot = path.resolve(ROOT);
    const full = path.resolve(resolvedRoot, normalized);
    if (!full.startsWith(resolvedRoot + path.sep) && full !== resolvedRoot) {
      throw new Error("Invalid storage key");
    }
    return full;
  }

  async put(key: string, data: Buffer): Promise<string> {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
    return key;
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async getLocalPath(key: string): Promise<string> {
    return this.resolve(key);
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(key));
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code !== "ENOENT") throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }
}
