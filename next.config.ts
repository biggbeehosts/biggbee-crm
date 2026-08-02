import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained .next/standalone server with only the deps actually used --
  // dramatically smaller than shipping the full node_modules tree in the production image.
  output: "standalone",

  // The `googleapis` package (used server-side in src/lib/data/sheets-client.ts) loads its
  // per-API clients via dynamic `require()`, which Next's static output-file tracer cannot
  // follow -- it silently drops the package's own files from every route's standalone bundle
  // (confirmed by inspecting the .nft.json trace files: googleapis-common is traced correctly,
  // but nothing under node_modules/googleapis/ itself is). Force-including it here is required,
  // or the container throws "Cannot find module 'googleapis'" the moment Sheets mode runs.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/googleapis/**/*"],
  },
};

export default nextConfig;
