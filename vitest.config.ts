import { defineConfig } from "vitest/config";
import { resolve } from "path";
import { existsSync, readFileSync } from "fs";

// Load .env into process.env for tests. lib/env validates env at import time,
// and the service-under-test imports that chain, so the vars must be present.
// Parsed directly (no dotenv/vite dep, neither of which resolves from root).
function loadDotenv(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const env = loadDotenv(resolve(__dirname, ".env"));

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    env,
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    exclude: ["node_modules", ".next", "tests/e2e"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules",
        ".next",
        "tests",
        "prisma",
        "scripts",
        "**/*.config.*",
      ],
    },
    testTimeout: 10_000,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
      // `server-only` throws when imported outside an RSC bundle; stub it so
      // server-side modules can be unit-tested in the Node environment.
      "server-only": resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
});
