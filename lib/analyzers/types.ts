export interface AnalysisResult {
  format: "PDF" | "ZIP" | "RAR" | "SEVEN_Z" | "WORD" | "EXCEL" | "POWERPOINT" | "UNKNOWN";
  isEncrypted: boolean;
  encryptionType?: string;
  entryCount?: number;
  uncompressedSize?: number;
  recoverySupported: boolean;
  details?: Record<string, unknown>;
}

export interface RecoveryAnalyzer {
  supports(format: string): boolean;
  analyze(filePath: string): Promise<AnalysisResult>;
}
