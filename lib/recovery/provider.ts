import { tryPdfPassword } from "@/lib/analyzers/pdf";
import { tryZipPassword } from "@/lib/analyzers/zip";
import { tryOfficePassword } from "@/lib/analyzers/office";
import { try7zPassword } from "@/lib/analyzers/sevenzip";
import { strategiesForMode, type RecoveryHints } from "./strategies";

export interface RecoveryOutcome {
  success: boolean;
  password?: string;
  strategy?: string;
  candidatesTried: number;
}

export interface RecoveryProviderOptions {
  format: "PDF" | "ZIP" | "SEVEN_Z" | "WORD" | "EXCEL" | "POWERPOINT";
  filePath: string;
  mode: "FAST_CHECK" | "DEEP_RECOVERY" | "LEGACY";
  hints: RecoveryHints;
  outPath: string;
  maxRuntimeMs: number;
  onProgress?: (candidatesTried: number, currentStrategy: string) => void;
  /** Checked periodically; return true to abort (e.g. user cancelled). */
  shouldAbort?: () => Promise<boolean> | boolean;
}

/**
 * The single real recovery engine. Every candidate is verified against the
 * actual file (qpdf --decrypt for PDF, unzip -t for ZIP) — nothing here
 * ever reports success without a verified decrypt/integrity check passing.
 */
export async function runRecovery(opts: RecoveryProviderOptions): Promise<RecoveryOutcome> {
  const strategies = strategiesForMode(opts.mode);
  const deadline = Date.now() + opts.maxRuntimeMs;
  let candidatesTried = 0;

  for (const strategy of strategies) {
    for (const candidate of strategy.candidates(opts.hints)) {
      if (Date.now() > deadline) {
        return { success: false, candidatesTried };
      }
      if (opts.shouldAbort && (await opts.shouldAbort())) {
        return { success: false, candidatesTried };
      }

      candidatesTried++;
      const ok =
        opts.format === "PDF"
          ? await tryPdfPassword(opts.filePath, opts.outPath, candidate)
          : opts.format === "ZIP"
            ? await tryZipPassword(opts.filePath, candidate)
            : opts.format === "SEVEN_Z"
              ? await try7zPassword(opts.filePath, candidate)
              : await tryOfficePassword(opts.filePath, opts.outPath, candidate);

      if (candidatesTried % 5 === 0) opts.onProgress?.(candidatesTried, strategy.name);

      if (ok) {
        opts.onProgress?.(candidatesTried, strategy.name);
        return { success: true, password: candidate, strategy: strategy.name, candidatesTried };
      }
    }
  }

  return { success: false, candidatesTried };
}
