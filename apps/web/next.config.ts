import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `motion` ships server entry points that Next's page-data collection
  // tries to require from a vendor chunk; transpiling it keeps the graph sane.
  transpilePackages: ["motion", "framer-motion"],
};

export default nextConfig;
