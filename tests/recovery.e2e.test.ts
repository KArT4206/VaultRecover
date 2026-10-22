import { describe, it, expect, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PdfAnalyzer, tryPdfPassword } from "@/lib/analyzers/pdf";
import { ZipAnalyzer, tryZipPassword } from "@/lib/analyzers/zip";
import { runRecovery } from "@/lib/recovery/provider";

const execFileAsync = promisify(execFile);

/**
 * Real, end-to-end verification against the actual qpdf/unzip binaries —
 * no mocking of the recovery engine. Skips gracefully if those CLIs are
 * not installed in the environment running the test.
 */
async function toolAvailable(bin: string, args: string[]): Promise<boolean> {
  try {
    await execFileAsync(bin, args);
    return true;
  } catch (err) {
    const e = err as { code?: string | number };
    return e.code !== "ENOENT";
  }
}

describe("real ZIP password recovery", () => {
  let tmpDir: string;

  it("creates a password-protected ZIP and recovers it via Fast Check", async () => {
    const hasZip = await toolAvailable("zip", ["-v"]);
    const hasUnzip = await toolAvailable("unzip", ["-v"]);
    if (!hasZip || !hasUnzip) {
      console.warn("zip/unzip CLI not available — skipping real ZIP e2e test");
      return;
    }

    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "vr-test-"));
    const secretFile = path.join(tmpDir, "secret.txt");
    await fs.writeFile(secretFile, "top secret contents");

    const zipPath = path.join(tmpDir, "protected.zip");
    await execFileAsync("zip", ["-P", "password123", "-j", zipPath, secretFile]);

    const analyzer = new ZipAnalyzer();
    const analysis = await analyzer.analyze(zipPath);
    expect(analysis.isEncrypted).toBe(true);
    expect(analysis.recoverySupported).toBe(true);

    const wrongPassword = await tryZipPassword(zipPath, "definitely-not-it");
    expect(wrongPassword).toBe(false);

    const rightPassword = await tryZipPassword(zipPath, "password123");
    expect(rightPassword).toBe(true);

    const outcome = await runRecovery({
      format: "ZIP",
      filePath: zipPath,
      mode: "FAST_CHECK",
      hints: {},
      outPath: path.join(tmpDir, "out"),
      maxRuntimeMs: 30_000,
    });
    expect(outcome.success).toBe(true);
    expect(outcome.password).toBe("password123");
  }, 30_000);

  it("ends FAILED (not falsely successful) for a password outside the wordlist and hints", async () => {
    const hasZip = await toolAvailable("zip", ["-v"]);
    if (!hasZip) return;

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vr-test-fail-"));
    const secretFile = path.join(dir, "secret.txt");
    await fs.writeFile(secretFile, "content");
    const zipPath = path.join(dir, "protected.zip");
    await execFileAsync("zip", ["-P", "zK9!qX7#unlikely", "-j", zipPath, secretFile]);

    const outcome = await runRecovery({
      format: "ZIP",
      filePath: zipPath,
      mode: "FAST_CHECK",
      hints: {},
      outPath: path.join(dir, "out"),
      maxRuntimeMs: 15_000,
    });
    expect(outcome.success).toBe(false);
    await fs.rm(dir, { recursive: true, force: true });
  }, 20_000);

  afterAll(async () => {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
  });
});

describe("real PDF password recovery", () => {
  it("creates a password-protected PDF and recovers it via Fast Check", async () => {
    const hasQpdf = await toolAvailable("qpdf", ["--version"]);
    if (!hasQpdf) {
      console.warn("qpdf CLI not available — skipping real PDF e2e test");
      return;
    }

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vr-test-pdf-"));
    const plainPdf = path.join(dir, "plain.pdf");
    // Minimal valid one-page PDF.
    // `qpdf --empty` writes a minimal, well-formed, valid PDF directly —
    // more reliable than hand-authoring PDF syntax for a test fixture.
    await execFileAsync("qpdf", ["--empty", plainPdf]);

    const protectedPdf = path.join(dir, "protected.pdf");
    await execFileAsync("qpdf", [
      "--encrypt", "password123", "password123", "256", "--",
      plainPdf,
      protectedPdf,
    ]);

    const analyzer = new PdfAnalyzer();
    const analysis = await analyzer.analyze(protectedPdf);
    expect(analysis.isEncrypted).toBe(true);

    const wrongTry = await tryPdfPassword(protectedPdf, path.join(dir, "wrong-out.pdf"), "nope");
    expect(wrongTry).toBe(false);

    const outcome = await runRecovery({
      format: "PDF",
      filePath: protectedPdf,
      mode: "FAST_CHECK",
      hints: {},
      outPath: path.join(dir, "recovered.pdf"),
      maxRuntimeMs: 30_000,
    });
    expect(outcome.success).toBe(true);
    expect(outcome.password).toBe("password123");

    const decrypted = await fs.readFile(path.join(dir, "recovered.pdf"));
    expect(decrypted.subarray(0, 5).toString()).toBe("%PDF-");

    await fs.rm(dir, { recursive: true, force: true });
  }, 30_000);
});
