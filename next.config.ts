import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["pino", "pino-pretty"],
  typedRoutes: true,
  // Tree-shake Recharts' barrel imports so only the used chart pieces ship.
  // (lucide-react is already optimized by Next's default list; Recharts is not.)
  experimental: {
    optimizePackageImports: ["recharts"],
  },
  // Pin the workspace root to this project. Without this, Next infers the root
  // from a stray lockfile in the home directory. Providing an explicit turbopack
  // config also resolves the "webpack config but no turbopack config" build error
  // introduced by the Sentry plugin under Next 16's default Turbopack builds.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
  tunnelRoute: "/monitoring",
});
