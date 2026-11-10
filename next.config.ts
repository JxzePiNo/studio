import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.MARGINE_E2E === "true" ? ".next-e2e" : ".next",
  turbopack: { root: process.cwd() },
  serverExternalPackages: ["pdf-lib"],
};
export default nextConfig;
