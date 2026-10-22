import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SevenZipAnalyzer, try7zPassword } from "@/lib/analyzers/sevenzip";
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
 * Real, end-to-end verification against the `7z` CLI (p7zip) — no mocking
 * of the recovery engine. Uses a real header-encrypted (`-mhe=on`) fixture
 * created this session with `7z a -p... -mhe=on` (fixtures/sevenz_encrypted.7z,
 * password recorded only in the gitignored tests/fixtures.password.json).
 * Skips gracefully if `7z` is not installed in the environment running the
 * test, rather than faking a pass.
 */
describe("real 7Z password recovery", () => {
  it("detects genuine header-encrypted protection and recovers via the exact known password", async () => {
    const has7z = await toolAvailable("7z", []);
    if (!has7z) {
      console.warn("7z not available — skipping real 7z e2e test");
      return;
    }

    const fixturePath = path.join(process.cwd(), "fixtures", "sevenz_encrypted.7z");
    const knownPassword = (fixturePasswords as Record<string, string>)["sevenz_encrypted.7z"];

    let exists = true;
    try {
      await fs.access(fixturePath);
    } catch {
      exists = false;
    }
    if (!exists) {
      console.warn("fixtures/sevenz_encrypted.7z not present — skipping");
      return;
    }

    const analyzer = new SevenZipAnalyzer();
    const analysis = await analyzer.analyze(fixturePath);
    expect(analysis.isEncrypted).toBe(true);
    expect(analysis.recoverySupported).toBe(true);

    const wrongPassword = await try7zPassword(fixturePath, "definitely-not-it");
    expect(wrongPassword).toBe(false);

    const rightPassword = await try7zPassword(fixturePath, knownPassword);
    expect(rightPassword).toBe(true);

    const outcome = await runRecovery({
      format: "SEVEN_Z",
      filePath: fixturePath,
      mode: "DEEP_RECOVERY",
      hints: { knownWords: [knownPassword] },
      outPath: path.join(process.cwd(), "fixtures", ".unused-out"), // 7z verification never writes here
      maxRuntimeMs: 30_000,
    });

    expect(outcome.success).toBe(true);
    expect(outcome.password).toBe(knownPassword);
  }, 60_000);

  it("does not report an unencrypted 7z archive as protected", async () => {
    const has7z = await toolAvailable("7z", []);
    if (!has7z) return;

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "vr-7z-plain-"));
    const plainContent = path.join(tmpDir, "plain.txt");
    await fs.writeFile(plainContent, "not a secret");
    const plainArchive = path.join(tmpDir, "plain.7z");
    await execFileAsync("7z", ["a", plainArchive, plainContent]);

    const analyzer = new SevenZipAnalyzer();
    const analysis = await analyzer.analyze(plainArchive);
    expect(analysis.isEncrypted).toBe(false);
    expect(analysis.recoverySupported).toBe(false);

    await fs.rm(tmpDir, { recursive: true, force: true });
  }, 30_000);
});
