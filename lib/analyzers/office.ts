import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { open as openZip } from "yauzl";
import fs from "node:fs/promises";
import path from "node:path";
import type { AnalysisResult, RecoveryAnalyzer } from "./types";

const execFileAsync = promisify(execFile);
const PYTHON_BIN = process.env.PYTHON_BIN || "python3";
const OFFICE_SCRIPT = path.join(process.cwd(), "scripts", "office_decrypt.py");

const OLE2_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

/**
 * Office analyzer for DOC/DOCX/XLS/XLSX/PPT/PPTX.
 *
 * Real detection, no guessing:
 *  - Legacy binary formats (.doc/.xls/.ppt) are OLE2/CFB containers. An
 *    open-password-protected legacy file has an "EncryptedPackage" or
 *    "EncryptedSummary"/RC4 stream — we detect this by checking for a CFB
 *    header AND then asking msoffcrypto-tool itself whether it's encrypted
 *    (msoffcrypto raises/returns false for non-encrypted OLE2 docs).
 *  - Modern OOXML formats (.docx/.xlsx/.pptx) are ZIP containers. An
 *    open-password-protected OOXML file is NOT a normal OOXML zip at all —
 *    Office re-wraps the whole document as an OLE2/CFB container holding an
 *    "EncryptionInfo" + "EncryptedPackage" stream. So an "encrypted docx"
 *    on disk actually has the OLE2 magic bytes, not the ZIP PK magic bytes.
 *    A plain OOXML zip (even one with edit/print restrictions baked into
 *    its `word/settings.xml` <w:documentProtection>) is NOT open-password
 *    protected and is correctly reported as not recovery-relevant here —
 *    we only ever queue genuine open-password jobs.
 */
export class OfficeAnalyzer implements RecoveryAnalyzer {
  supports(format: string): boolean {
    return format === "WORD" || format === "EXCEL" || format === "POWERPOINT";
  }

  async analyze(filePath: string): Promise<AnalysisResult> {
    const format = (await this.detectFormatTag(filePath)) as AnalysisResult["format"];
    const buf = await fs.readFile(filePath, { flag: "r" }).then((b) => b.subarray(0, 8));

    if (buf.subarray(0, 8).equals(OLE2_MAGIC)) {
      // OLE2/CFB container: could be a legacy binary doc (encrypted or not)
      // or an OOXML file wrapped for open-password protection. Ask the
      // real decrypt library whether an EncryptionInfo/EncryptedPackage
      // stream is present.
      const isEncrypted = await this.probeOleEncrypted(filePath);
      return {
        format,
        isEncrypted,
        encryptionType: isEncrypted ? "Office open-password (OLE2/CFB, RC4 or CryptoAPI)" : undefined,
        recoverySupported: isEncrypted,
        details: isEncrypted ? undefined : { reason: "OLE2 container present but not open-password protected" },
      };
    }

    // Plain ZIP/OOXML signature => never open-password protected (that case
    // always re-wraps as OLE2, per the Office spec). Edit/print restrictions
    // may exist inside word/settings.xml etc, but those are not recoverable
    // via a password-guessing open-decrypt path, so report honestly.
    const isZip =
      buf.subarray(0, 2).equals(Buffer.from([0x50, 0x4b]));
    if (isZip) {
      return {
        format,
        isEncrypted: false,
        recoverySupported: false,
        details: { reason: "Plain OOXML package — not open-password protected (may have edit/print restrictions only, which are not recoverable via this path)" },
      };
    }

    return {
      format,
      isEncrypted: false,
      recoverySupported: false,
      details: { reason: "Unrecognized container — neither OLE2/CFB nor ZIP/OOXML signature" },
    };
  }

  private async detectFormatTag(filePath: string): Promise<string> {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".doc" || ext === ".docx") return "WORD";
    if (ext === ".xls" || ext === ".xlsx") return "EXCEL";
    if (ext === ".ppt" || ext === ".pptx") return "POWERPOINT";
    return "WORD";
  }

  /** Uses msoffcrypto (via the same python helper, --probe mode) to check for a real EncryptionInfo stream. */
  private async probeOleEncrypted(filePath: string): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync(PYTHON_BIN, [
        "-c",
        "import sys,msoffcrypto\n" +
          "with open(sys.argv[1],'rb') as f:\n" +
          "    o = msoffcrypto.OfficeFile(f)\n" +
          "    print('1' if o.is_encrypted() else '0')\n",
        filePath,
      ]);
      return stdout.trim() === "1";
    } catch {
      // If msoffcrypto can't even parse it as an Office file, treat as not
      // recoverable rather than guessing.
      return false;
    }
  }
}

/**
 * Verifies `password` by attempting a REAL decrypt via msoffcrypto-tool
 * (shelled Python helper, password passed via stdin, never argv). Only
 * returns true if the file was genuinely decrypted; writes the real
 * decrypted bytes to outPath on success.
 */
export async function tryOfficePassword(filePath: string, outPath: string, password: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(PYTHON_BIN, [OFFICE_SCRIPT, filePath, outPath], { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.on("error", () => resolve(false));
    child.on("close", (code) => {
      if (code !== 0 && stderr) {
        // swallow — reported via return value only, matches zip/pdf pattern
      }
      resolve(code === 0);
    });
    child.stdin.write(password + "\n");
    child.stdin.end();
  });
}

// Re-export for callers that want to sanity-check a decrypted OOXML output
// is itself a valid zip (extra real verification, optional).
export async function isValidZip(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    openZip(filePath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) return resolve(false);
      zipfile.close();
      resolve(true);
    });
  });
}
