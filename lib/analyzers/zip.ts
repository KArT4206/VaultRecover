import yauzl from "yauzl";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AnalysisResult, RecoveryAnalyzer } from "./types";

const execFileAsync = promisify(execFile);
const UNZIP_BIN = process.env.UNZIP_BIN || "unzip";

const MAX_ENTRIES = 50_000;
const MAX_UNCOMPRESSED_BYTES = 5 * 1024 * 1024 * 1024; // 5GB guard against zip-bombs

function openZip(filePath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) return reject(err ?? new Error("failed to open zip"));
      resolve(zipfile);
    });
  });
}

/**
 * ZIP analyzer. Walks the central directory only (never inflates entries
 * during analysis) and enforces entry-count / uncompressed-size caps as a
 * zip-bomb guard before any later processing touches this file.
 */
export class ZipAnalyzer implements RecoveryAnalyzer {
  supports(format: string): boolean {
    return format === "ZIP";
  }

  async analyze(filePath: string): Promise<AnalysisResult> {
    const zipfile = await openZip(filePath);
    let entryCount = 0;
    let uncompressedSize = 0;
    let isEncrypted = false;
    let aborted = false;

    await new Promise<void>((resolve, reject) => {
      zipfile.on("entry", (entry: yauzl.Entry) => {
        entryCount++;
        uncompressedSize += entry.uncompressedSize;
        // General purpose bit flag bit 0 = encrypted entry.
        if ((entry.generalPurposeBitFlag & 0x1) !== 0) isEncrypted = true;

        if (entryCount > MAX_ENTRIES || uncompressedSize > MAX_UNCOMPRESSED_BYTES) {
          aborted = true;
          zipfile.close();
          return resolve();
        }
        zipfile.readEntry();
      });
      zipfile.on("end", () => resolve());
      zipfile.on("error", (err) => reject(err));
      zipfile.readEntry();
    });

    if (aborted) {
      return {
        format: "ZIP",
        isEncrypted,
        entryCount,
        uncompressedSize,
        recoverySupported: false,
        details: { rejected: "zip-bomb guard triggered (entry count or size cap exceeded)" },
      };
    }

    return {
      format: "ZIP",
      isEncrypted,
      encryptionType: isEncrypted ? "ZipCrypto / AES (per-entry)" : undefined,
      entryCount,
      uncompressedSize,
      recoverySupported: isEncrypted,
    };
  }
}

/**
 * Attempts to verify `password` against every entry of filePath by shelling
 * out to `unzip -t` (integrity test only, never extracts to disk). This is
 * real cryptographic verification against the actual file — a candidate is
 * only ever reported as the answer if this returns true. Supports
 * traditional PKWARE (ZipCrypto) encryption; WinZip AES entries are handled
 * the same way since Info-ZIP's unzip also verifies AE-x entries when built
 * with AES support, otherwise this correctly reports failure rather than a
 * false positive.
 */
export async function tryZipPassword(filePath: string, password: string): Promise<boolean> {
  // On serverless hosts the `unzip` binary is unavailable, so verify traditional
  // PKWARE (ZipCrypto) encryption in pure TypeScript instead. The pure path is
  // parity-tested against the binary in tests/zipcrypto.test.ts.
  if (process.env.VERCEL || process.env.VAULT_PURE_ZIP === "1") {
    const { verifyZipCryptoPassword } = await import("./zipcrypto");
    return verifyZipCryptoPassword(filePath, password);
  }
  try {
    await execFileAsync(UNZIP_BIN, ["-t", "-P", password, filePath], { timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

/** Extracts filePath into destDir using the verified password. */
export async function extractZip(filePath: string, password: string, destDir: string): Promise<void> {
  await execFileAsync(UNZIP_BIN, ["-o", "-P", password, filePath, "-d", destDir], {
    timeout: 30_000,
  });
}
