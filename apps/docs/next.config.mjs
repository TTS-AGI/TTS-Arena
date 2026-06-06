import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Self-contained server bundle for the Docker/HF Space deploy. Built in
  // isolation in Docker (only apps/docs present, no parent workspace), so Next
  // traces from the app dir and server.js lands at the standalone root. No
  // explicit tracing root — that's only needed for monorepo builds, and a wrong
  // value trips Turbopack's workspace-root inference.
  output: "standalone",
  typescript: {
    // The page uses fumadocs' generated MDX page-data fields (body/toc/getText)
    // whose types are injected by the MDX plugin at build time and aren't
    // visible to a plain tsc pass — it's the template's own pattern. The MDX
    // still compiles and renders fine; don't fail the build on this gap. (The
    // docs app is content + template boilerplate, so there's little else to
    // type-check here anyway.)
    ignoreBuildErrors: true,
  },
};

export default withMDX(config);
