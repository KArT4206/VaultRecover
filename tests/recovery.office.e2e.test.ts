import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { OfficeAnalyzer, tryOfficePassword } from "@/lib/analyzers/office";
import { runRecovery } from "@/lib/recovery/provider";
import fixturePasswords from "./fixtures.password.json";

const execFileAsync = promisify(execFile);

async function toolAvailable(bin: string, args: string[]): Promise<boolean> {
  try {
    await execFileAsync(bin, args);
    return true;
  } catch (err) {
    const e = err as { code?: string | number };
    return e.code !== "ENOENT";
  }
}

/**
 * Real, end-to-end verification against msoffcrypto-tool (via the shelled
 * python helper) — no mocking of the recovery engine. Uses a real OOXML
 * fixture created this session with `msoffcrypto.format.ooxml.OOXMLFile.encrypt`
 * (fixtures/office_encrypted.xlsx, password recorded only in the gitignored
 * tests/fixtures.password.json). Skips gracefully if python3/msoffcrypto are
 * not available in the environment running the test.
 */
describe("real Office (xlsx) password recovery", () => {
  it("detects genuine open-password protection and recovers via the exact known password", async () => {
    const hasPython = await toolAvailable("python3", ["--version"]);
    if (!hasPython) {
      console.warn("python3 not available — skipping real Office e2e test");
      return;
    }

    const fixturePath = path.join(process.cwd(), "fixtures", "office_encrypted.xlsx");
    const knownPassword = (fixturePasswords as Record<string, string>)["office_encrypted.xlsx"];

    let exists = true;
    try {
      await fs.access(fixturePath);
    } catch {
      exists = false;
    }
    if (!exists) {
      console.warn("fixtures/office_encrypted.xlsx not present — skipping (see fixture-generation notes in office.ts)");
      return;
    }

    const analyzer = new OfficeAnalyzer();
    const analysis = await analyzer.analyze(fixturePath);
    expect(analysis.isEncrypted).toBe(true);
    expect(analysis.recoverySupported).toBe(true);

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "vr-office-test-"));
    const wrongOut = path.join(tmpDir, "wrong-out.xlsx");
    const wrongPassword = await tryOfficePassword(fixturePath, wrongOut, "definitely-not-it");
    expect(wrongPassword).toBe(false);

    const rightOut = path.join(tmpDir, "right-out.xlsx");
    const rightPassword = await tryOfficePassword(fixturePath, rightOut, knownPassword);
    expect(rightPassword).toBe(true);

    // The decrypted output is itself a real, valid OOXML zip.
    const decryptedBuf = await fs.readFile(rightOut);
    expect(decryptedBuf.subarray(0, 2).toString("latin1")).toBe("PK");

    const outcome = await runRecovery({
      format: "EXCEL",
      filePath: fixturePath,
      mode: "DEEP_RECOVERY",
      hints: { knownWords: [knownPassword] },
      outPath: path.join(tmpDir, "recovery-out.xlsx"),
      maxRuntimeMs: 30_000,
    });

    expect(outcome.success).toBe(true);
    expect(outcome.password).toBe(knownPassword);

    await fs.rm(tmpDir, { recursive: true, force: true });
  }, 60_000);

  it("does not report an unrelated plain OOXML zip as open-password protected", async () => {
    const plainPath = path.join(process.cwd(), "fixtures", "office_plain.xlsx");
    let exists = true;
    try {
      await fs.access(plainPath);
    } catch {
      exists = false;
    }
    if (!exists) return;

    const analyzer = new OfficeAnalyzer();
    const analysis = await analyzer.analyze(plainPath);
    expect(analysis.isEncrypted).toBe(false);
    expect(analysis.recoverySupported).toBe(false);
  });
});
