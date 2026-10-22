import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AnalysisResult, RecoveryAnalyzer } from "./types";

const execFileAsync = promisify(execFile);
const QPDF_BIN = process.env.QPDF_BIN || "qpdf";

/**
 * PDF analyzer backed by the `qpdf` CLI — a real, well-maintained,
 * legally-clean open-source tool. We never trust the .pdf extension alone;
 * the caller has already verified the %PDF- magic bytes.
 */
export class PdfAnalyzer implements RecoveryAnalyzer {
  supports(format: string): boolean {
    return format === "PDF";
  }

  async analyze(filePath: string): Promise<AnalysisResult> {
    try {
      // qpdf --is-encrypted exits 0 if encrypted, 2 if not encrypted, >2 on error.
      await execFileAsync(QPDF_BIN, ["--is-encrypted", filePath]);
      return {
        format: "PDF",
        isEncrypted: true,
        encryptionType: "PDF standard security handler",
        recoverySupported: true,
      };
    } catch (err) {
      const e = err as { code?: number };
      if (e.code === 2) {
        return { format: "PDF", isEncrypted: false, recoverySupported: false };
      }
      // qpdf missing or file malformed — report as unsupported rather than
      // guessing, so we never claim false confidence.
      return {
        format: "PDF",
        isEncrypted: false,
        recoverySupported: false,
        details: { error: "qpdf analysis failed", code: e.code },
      };
    }
  }
}

/** Attempts to open (decrypt) filePath with `password`. Returns true only on real success. */
export async function tryPdfPassword(filePath: string, outPath: string, password: string): Promise<boolean> {
  try {
    await execFileAsync(QPDF_BIN, [`--password=${password}`, "--decrypt", filePath, outPath]);
    return true;
  } catch {
    return false;
  }
}
