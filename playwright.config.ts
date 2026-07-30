import { defineConfig, devices } from "@playwright/test";
import { ADMIN_STATE } from "./tests/e2e/helpers";

// Base URL is overridable so the suite can target a dev server on any port
// (e.g. PLAYWRIGHT_BASE_URL=http://localhost:3001). When set, we assume an
// externally-managed server and skip the built-in webServer.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const useExternalServer = Boolean(process.env.PLAYWRIGHT_BASE_URL);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    // Signs in once per role and saves the session (tests/e2e/.auth/*.json).
    // Browser projects depend on it so specs start authenticated — sign-in is
    // rate-limited to 5/60s, so a per-test login breaks the suite.
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      testIgnore: /.*\.setup\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: ADMIN_STATE },
      dependencies: ["setup"],
    },
    {
      name: "firefox",
      testIgnore: /.*\.setup\.ts/,
      use: { ...devices["Desktop Firefox"], storageState: ADMIN_STATE },
      dependencies: ["setup"],
    },
    {
      name: "webkit",
      testIgnore: /.*\.setup\.ts/,
      use: { ...devices["Desktop Safari"], storageState: ADMIN_STATE },
      dependencies: ["setup"],
    },
    {
      name: "mobile",
      testIgnore: /.*\.setup\.ts/,
      use: { ...devices["iPhone 14"], storageState: ADMIN_STATE },
      dependencies: ["setup"],
    },
  ],
  webServer: useExternalServer
    ? undefined
    : {
        command: "pnpm dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
