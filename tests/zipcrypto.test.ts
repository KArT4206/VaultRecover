import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { verifyZipCryptoPassword, loadZipCryptoTarget, verifyPassword } from "@/lib/analyzers/zipcrypto";
import { tryZipPassword } from "@/lib/analyzers/zip";

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
 * The pure-TS ZipCrypto verifier must agree exactly with the real `unzip`
 * binary: same correct password accepted, every wrong password rejected, and
 * no false positives from the header pre-filter.
 */
describe("pure-TS ZipCrypto verifier", () => {
  let tmpDir: string;
  let zipPath: string;
  const PASSWORD = "VaultTest#2026";
  let haveTools = false;

  beforeAll(async () => {
    haveTools = (await toolAvailable("zip", ["-v"])) && (await toolAvailable("unzip", ["-v"]));
    if (!haveTools) return;
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "vr-zipcrypto-"));
    const secret = path.join(tmpDir, "secret.txt");
    await fs.writeFile(secret, "the quick brown fox jumps over the lazy dog ".repeat(40));
    zipPath = path.join(tmpDir, "locked.zip");
    // -e forces traditional PKWARE (ZipCrypto) encryption.
    await execFileAsync("zip", ["-e", "-P", PASSWORD, zipPath, secret], { cwd: tmpDir });
  });

  afterAll(async () => {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("accepts the correct password", async () => {
    if (!haveTools) return;
    expect(await verifyZipCryptoPassword(zipPath, PASSWORD)).toBe(true);
  });

  it("rejects wrong passwords with no false positives over many candidates", async () => {
    if (!haveTools) return;
    const target = await loadZipCryptoTarget(zipPath);
    expect(target).not.toBeNull();
    let falsePositives = 0;
    for (let i = 0; i < 2000; i++) {
      const guess = `wrong-${i}`;
      if (guess !== PASSWORD && verifyPassword(target!, guess)) falsePositives++;
    }
    expect(falsePositives).toBe(0);
  });

  it("agrees with the unzip binary on correct and wrong passwords", async () => {
    if (!haveTools) return;
    for (const pw of [PASSWORD, "nope", "VaultTest#2025", "almost#2026"]) {
      const pure = await verifyZipCryptoPassword(zipPath, pw);
      const binary = await tryZipPassword(zipPath, pw);
      expect(pure).toBe(binary);
    }
  });

  it("returns null for a non-encrypted archive", async () => {
    if (!haveTools) return;
    const plain = path.join(tmpDir, "plain.zip");
    await execFileAsync("zip", [plain, path.join(tmpDir, "secret.txt")], { cwd: tmpDir });
    expect(await loadZipCryptoTarget(plain)).toBeNull();
  });
});
