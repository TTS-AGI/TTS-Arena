import type { NextConfig } from "next";
import { resolve } from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Lean, self-contained server bundle for the production Docker image.
  output: "standalone",
  // Trace from the monorepo root so workspace deps are bundled. Next runs with
  // cwd at apps/web, so the root is two levels up.
  outputFileTracingRoot: resolve(process.cwd(), "../.."),
  // `motion` ships server entry points that Next's page-data collection
  // tries to require from a vendor chunk; transpiling it keeps the graph sane.
  transpilePackages: ["motion", "framer-motion"],
};

export default nextConfig;
