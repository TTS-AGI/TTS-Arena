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
  // `pg` is a server-only package; keep it external so Next doesn't try to
  // bundle it into client/edge chunks.
  serverExternalPackages: ["pg"],
  // The HF Space builder has a tight memory cap; the default multi-worker
  // prerender was getting OOMKilled. Prerender in a single worker to keep peak
  // memory well under the limit (slower build, but it completes).
  experimental: {
    cpus: 1,
    workerThreads: false,
  },
};

export default nextConfig;
