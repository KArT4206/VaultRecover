import crypto from "node:crypto";

export type DetectedFormat =
  | "PDF"
  | "ZIP"
  | "RAR"
  | "SEVEN_Z"
  | "WORD"
  | "EXCEL"
  | "POWERPOINT"
  | "UNKNOWN";

/**
 * Real magic-byte sniffing — never trusts the client-supplied extension or
 * MIME type. Office formats (docx/xlsx/pptx) are ZIP containers, so we
 * sniff the ZIP signature and defer finer distinction to extension as a
 * hint only (never as the trust boundary).
 */
export function detectFormatFromBytes(buf: Buffer, hintExt: string): DetectedFormat {
  const sig = (n: number) => buf.subarray(0, n);

  if (sig(5).toString("latin1") === "%PDF-") return "PDF";
  if (sig(4).equals(Buffer.from([0x52, 0x61, 0x72, 0x21]))) return "RAR"; // Rar!
  if (sig(6).equals(Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]))) return "SEVEN_Z";

  const isZipMagic =
    sig(4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) ||
    sig(4).equals(Buffer.from([0x50, 0x4b, 0x05, 0x06])) || // empty zip
    sig(4).equals(Buffer.from([0x50, 0x4b, 0x07, 0x08]));

  if (isZipMagic) {
    const ext = hintExt.toLowerCase();
    if (ext === "docx" || ext === "doc") return "WORD";
    if (ext === "xlsx" || ext === "xls") return "EXCEL";
    if (ext === "pptx" || ext === "ppt") return "POWERPOINT";
    return "ZIP";
  }

  // OLE2/CFB signature: legacy binary Office files (doc/xls/ppt), AND
  // password-encrypted modern OOXML files (docx/xlsx/pptx get wrapped in a
  // CFB container by Office's own encryption, so an encrypted .xlsx does
  // NOT look like a ZIP on disk even though the unencrypted file would).
  const isOle2Magic = sig(8).equals(
    Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
  );
  if (isOle2Magic) {
    const ext = hintExt.toLowerCase();
    if (ext === "doc" || ext === "docx") return "WORD";
    if (ext === "xls" || ext === "xlsx") return "EXCEL";
    if (ext === "ppt" || ext === "pptx") return "POWERPOINT";
    return "UNKNOWN";
  }

  return "UNKNOWN";
}

export const ALLOWED_EXTENSIONS = new Set([
  "pdf",
  "zip",
  "rar",
  "7z",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
]);

export function extOf(filename: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(filename);
  return m ? m[1].toLowerCase() : "";
}

export function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export interface ValidationResult {
  ok: boolean;
  reason?: string;
  format: DetectedFormat;
}

export function validateUpload(
  buf: Buffer,
  originalName: string,
  maxSize: number
): ValidationResult {
  const ext = extOf(originalName);
  if (buf.length === 0) return { ok: false, reason: "Empty file", format: "UNKNOWN" };
  if (buf.length > maxSize)
    return { ok: false, reason: `File exceeds ${maxSize} byte limit`, format: "UNKNOWN" };
  if (!ALLOWED_EXTENSIONS.has(ext))
    return { ok: false, reason: `Unsupported extension .${ext}`, format: "UNKNOWN" };

  const format = detectFormatFromBytes(buf, ext);
  if (format === "UNKNOWN")
    return {
      ok: false,
      reason: "File content does not match a known, supported file format",
      format,
    };

  return { ok: true, format };
}
