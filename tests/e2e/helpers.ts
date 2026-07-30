import { type Page, expect } from "@playwright/test";

/**
 * Shared E2E helpers. Uses role/label locators rather than `#id` selectors:
 * the app's shadcn <Input>s have generated ids (label association via useId),
 * so `getByLabel`/`getByRole` are the stable way to drive the forms.
 *
 * Credentials come from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD (the seeded
 * admin). Set them in the environment before running the E2E suite.
 */
export const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@safarcrm.local";
export const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe-Local-12345";

// Demo AGENT seeded by prisma/seed.ts — used for ownership/authorization specs.
// Defaults mirror the seed constants; override via env if the seed changes.
export const AGENT_EMAIL = process.env.SEED_AGENT_EMAIL ?? "agent@safarcrm.local";
export const AGENT_PASSWORD = process.env.SEED_AGENT_PASSWORD ?? "DemoAgent!2026";

/**
 * Saved sessions written once by `auth.setup.ts` and reused by every spec.
 *
 * The app rate-limits POST /api/auth/sign-in/email to 5 requests per 60s
 * (`lib/auth/server.ts`). Signing in per test exceeded that budget and made
 * every later spec fail with a 429 and a dashboard timeout, so only the specs
 * that actually exercise sign-in (`auth`, `lockout`) log in for real.
 */
export const ADMIN_STATE = "tests/e2e/.auth/admin.json";
export const AGENT_STATE = "tests/e2e/.auth/agent.json";

/** Signed-out browser state, for specs that must start unauthenticated. */
export const NO_STATE = { cookies: [], origins: [] };

export async function login(
  page: Page,
  email: string = ADMIN_EMAIL,
  password: string = ADMIN_PASSWORD,
) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  // App Router navigation does not reliably trigger a new document `load`
  // event, so use Playwright's web-first URL assertion instead of waitForURL.
  await expect(page).toHaveURL(/\/dashboard(?:[?#]|$)/, { timeout: 15_000 });
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/login(?:[?#]|$)/, { timeout: 15_000 });
}

export async function expectOnLogin(page: Page) {
  await expect(page).toHaveURL(/\/login/);
}
