import { PdfAnalyzer } from "./pdf";
import { ZipAnalyzer } from "./zip";
import { OfficeAnalyzer } from "./office";
import { SevenZipAnalyzer } from "./sevenzip";
import type { AnalysisResult, RecoveryAnalyzer } from "./types";

export type { AnalysisResult } from "./types";

const analyzers: RecoveryAnalyzer[] = [
  new PdfAnalyzer(),
  new ZipAnalyzer(),
  new OfficeAnalyzer(),
  new SevenZipAnalyzer(),
];

export async function analyzeFile(format: string, filePath: string): Promise<AnalysisResult> {
  const analyzer = analyzers.find((a) => a.supports(format));
  if (!analyzer) {
    return {
      format: format as AnalysisResult["format"],
      isEncrypted: false,
      recoverySupported: false,
      details: { reason: `No analyzer implemented for ${format} yet (informational page only)` },
    };
  }
  return analyzer.analyze(filePath);
}
