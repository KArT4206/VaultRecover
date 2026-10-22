import { spawn } from "node:child_process";
import type { AnalysisResult, RecoveryAnalyzer } from "./types";

const SEVENZIP_BIN = process.env.SEVENZIP_BIN || "7z";

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Runs the real `7z` CLI with stdin explicitly closed (`stdio: ["ignore", ...]`).
 * This matters: `7z` prompts interactively for a password on an encrypted
 * archive even with `-y`, and `child_process.execFile` does NOT support
 * overriding `stdio` (only `spawn` does) — using execFile here would leave
 * stdin as an open pipe that's never closed, hanging every call until a
 * timeout kills it. spawn + stdin:"ignore" gives 7z immediate EOF, exactly
 * like `< /dev/null` on the command line, so it fails fast and correctly.
 */
function run7z(args: string[], timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(SEVENZIP_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: "spawn failed" });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

/**
 * 7Z analyzer backed by the real `7z` CLI (p7zip). Never trusts the
 * extension — caller has already verified the 7z magic bytes
 * (37 7A BC AF 27 1C). Two distinct encryption shapes exist:
 *  - header-encrypted (`-mhe=on`): `7z l` without a password fails outright
 *    (exit 2, "Can not open encrypted archive").
 *  - content-only encrypted: `7z l` succeeds (filenames visible) but the
 *    Method line reports an AES cipher (e.g. "LZMA2:12 7zAES").
 */
export class SevenZipAnalyzer implements RecoveryAnalyzer {
  supports(format: string): boolean {
    return format === "SEVEN_Z";
  }

  async analyze(filePath: string): Promise<AnalysisResult> {
    const { code, stdout, stderr } = await run7z(["l", "-y", filePath], 15_000);

    if (code === 0) {
      const isEncrypted = /7zAES|AES256/i.test(stdout);
      return {
        format: "SEVEN_Z",
        isEncrypted,
        encryptionType: isEncrypted ? "AES-256 (content)" : undefined,
        recoverySupported: isEncrypted,
      };
    }

    if (code === 2 && /encrypted|wrong password/i.test(stderr)) {
      // Header-encrypted archive — can't even list filenames without a password.
      return {
        format: "SEVEN_Z",
        isEncrypted: true,
        encryptionType: "AES-256 (headers + content)",
        recoverySupported: true,
      };
    }

    return {
      format: "SEVEN_Z",
      isEncrypted: false,
      recoverySupported: false,
      details: { error: "7z analysis failed", code },
    };
  }
}

/**
 * Verifies `password` by running `7z t -p<password>` (real integrity test
 * against the actual archive, no extraction to disk). Only returns true on
 * a genuine "Everything is Ok" exit-0 result.
 */
export async function try7zPassword(filePath: string, password: string): Promise<boolean> {
  const { code } = await run7z(["t", `-p${password}`, "-y", filePath], 20_000);
  return code === 0;
}

/** Extracts filePath into destDir using the verified password. */
export async function extract7z(filePath: string, password: string, destDir: string): Promise<boolean> {
  const { code } = await run7z(["x", `-p${password}`, "-y", `-o${destDir}`, filePath], 60_000);
  return code === 0;
}
