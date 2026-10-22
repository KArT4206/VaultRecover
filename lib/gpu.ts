import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GpuProbeResult {
  hasGpu: boolean;
  /** Human-readable description of what was actually found, for the UI/admin dashboard. */
  info: string;
  /**
   * True only if a real GPU-accelerated cracking tool (hashcat) is ALSO
   * installed and can see the device — i.e. GPU acceleration is genuinely
   * usable, not just "a GPU chip exists in this machine". VaultRecover's
   * current recovery engine (qpdf/unzip/7z/msoffcrypto) is CPU-bound CLI
   * tooling regardless of this flag — it never claims GPU speedup for
   * candidate verification. This field exists so the architecture is
   * truthful about what *could* be GPU-accelerated later (hash-based
   * attacks via hashcat), without pretending it already is.
   */
  accelerationAvailable: boolean;
}

async function hasHashcat(): Promise<boolean> {
  try {
    await execFileAsync("hashcat", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

async function probeNvidia(): Promise<{ found: boolean; info?: string }> {
  try {
    const { stdout } = await execFileAsync("nvidia-smi", [
      "--query-gpu=name",
      "--format=csv,noheader",
    ]);
    const name = stdout.trim().split("\n")[0];
    return name ? { found: true, info: `NVIDIA ${name} (via nvidia-smi)` } : { found: false };
  } catch {
    return { found: false };
  }
}

async function probeAppleSilicon(): Promise<{ found: boolean; info?: string }> {
  if (process.platform !== "darwin") return { found: false };
  try {
    const { stdout } = await execFileAsync("system_profiler", ["SPDisplaysDataType"]);
    const chipMatch = /Chipset Model:\s*(.+)/.exec(stdout);
    const coresMatch = /Total Number of Cores:\s*(\d+)/.exec(stdout);
    if (chipMatch) {
      const cores = coresMatch ? `, ${coresMatch[1]}-core` : "";
      return { found: true, info: `${chipMatch[1].trim()}${cores} GPU (via system_profiler)` };
    }
    return { found: false };
  } catch {
    return { found: false };
  }
}

/**
 * Real hardware capability probe — runs actual system commands and only
 * ever reports a GPU as present if one of them genuinely found one. Never
 * assumes, never defaults to true. On a machine with no discrete/integrated
 * GPU visible to these tools, this correctly returns hasGpu: false.
 */
export async function probeGpu(): Promise<GpuProbeResult> {
  const nvidia = await probeNvidia();
  if (nvidia.found) {
    const accel = await hasHashcat();
    return {
      hasGpu: true,
      info: accel
        ? `${nvidia.info} — hashcat installed, GPU-accelerated hash attacks available`
        : `${nvidia.info} — hashcat not installed, so GPU-accelerated hash attacks are not available; this worker runs the same CPU-bound CLI verifiers (qpdf/unzip/7z/msoffcrypto) as a CPU worker`,
      accelerationAvailable: accel,
    };
  }

  const apple = await probeAppleSilicon();
  if (apple.found) {
    const accel = await hasHashcat();
    return {
      hasGpu: true,
      info: accel
        ? `${apple.info} — hashcat installed with OpenCL/Metal backend, GPU-accelerated hash attacks available`
        : `${apple.info} — hashcat not installed, so GPU-accelerated hash attacks are not available; this worker runs the same CPU-bound CLI verifiers (qpdf/unzip/7z/msoffcrypto) as a CPU worker`,
      accelerationAvailable: accel,
    };
  }

  return {
    hasGpu: false,
    info: "No GPU detected on this host (nvidia-smi absent, no Apple Silicon GPU found).",
    accelerationAvailable: false,
  };
}
