import { test as setup, expect, type Page } from "@playwright/test";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ADMIN_STATE,
  AGENT_EMAIL,
  AGENT_PASSWORD,
  AGENT_STATE,
} from "./helpers";

/**
 * Authenticate once per role and persist the session to disk. Browser projects
 * declare `dependencies: ["setup"]` and load one of these states, so specs
 * start already signed in.
 *
 * This exists because POST /api/auth/sign-in/email is rate-limited to 5
 * requests per 60s (`lib/auth/server.ts`). A per-test login blew that budget
 * partway through the suite and every remaining spec failed with a 429.
 */
async function signIn(
  page: Page,
  email: string,
  password: string,
  statePath: string,
) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  // Cold dev-server compiles need headroom; CI runs against `pnpm dev`.
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 });
  await page.context().storageState({ path: statePath });
}

setup("authenticate as ADMIN", async ({ page }) => {
  await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_STATE);
});

setup("authenticate as AGENT", async ({ page }) => {
  await signIn(page, AGENT_EMAIL, AGENT_PASSWORD, AGENT_STATE);
});
