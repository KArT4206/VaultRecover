import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: false },
  serverExternalPackages: ["pino", "yauzl"],
};

export default nextConfig;
