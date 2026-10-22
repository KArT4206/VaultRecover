import "dotenv/config";
import { logger } from "../lib/logger";
import { runWorkerProcess } from "./shared";

/**
 * GPU worker entrypoint — gated behind GPU_ENABLED so it's never started
 * by accident and mistaken for real GPU acceleration when nobody opted in.
 * Even when enabled, this process runs the exact same CLI-based candidate
 * verification as the CPU worker (see worker/shared.ts) — the difference is
 * purely in what it reports about the host's real hardware, via a genuine
 * probe (lib/gpu.ts), never a fabricated one.
 */
if (process.env.GPU_ENABLED !== "true") {
  logger.warn(
    "GPU_ENABLED is not 'true' — refusing to start the GPU worker. " +
      "Set GPU_ENABLED=true to start it (it will still report real hardware findings, " +
      "not fake GPU acceleration, if no GPU-capable cracking tool is installed)."
  );
  process.exit(1);
}

runWorkerProcess("GPU");
