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
  // better-sqlite3 is a native addon; keep it external so its .node binary is
  // required at runtime (and traced into the standalone bundle) rather than
  // being bundled by webpack.
  serverExternalPackages: ["better-sqlite3"],
  // The HF Space builder has a tight memory cap; the default multi-worker
  // prerender was getting OOMKilled. Prerender in a single worker to keep peak
  // memory well under the limit (slower build, but it completes).
  experimental: {
    cpus: 1,
    workerThreads: false,
  },
  webpack: (config) => {
    // `bun:sqlite` only exists in the Bun runtime; the DB client requires it
    // dynamically there. Mark it external so the Node/webpack build doesn't try
    // to resolve it (it's never reached under Node).
    config.externals = config.externals ?? [];
    if (Array.isArray(config.externals)) {
      config.externals.push({ "bun:sqlite": "commonjs bun:sqlite" });
    }
    return config;
  },
};

export default nextConfig;
