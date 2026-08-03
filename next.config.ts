import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained .next/standalone server with only the deps actually used --
  // dramatically smaller than shipping the full node_modules tree in the production image.
  output: "standalone",

  // The `googleapis` package (used server-side in src/lib/data/sheets-client.ts) loads its
  // per-API clients, and those clients' own auth/http helpers, via dynamic `require()` at every
  // level of the dependency tree (including nested, version-pinned copies under
  // googleapis-common/node_modules/*). Next's static output-file tracer can't follow any of
  // that, so naming individual packages here is whack-a-mole -- each fix surfaces the next
  // missing transitive dep ("googleapis-common", then "google-auth-library", then "extend", ...).
  // Force-including the whole node_modules tree for every route sidesteps it entirely.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/**/*"],
  },

  // Content-Security-Policy is set per-request in middleware (it needs a fresh nonce every
  // request); everything else static goes here. Applies to every route including /login /setup.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
    ];
  },
};

export default nextConfig;
