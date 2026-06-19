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

export async function login(
  page: Page,
  email: string = ADMIN_EMAIL,
  password: string = ADMIN_PASSWORD,
) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: /sign out/i }).click();
  await page.waitForURL("**/login", { timeout: 15_000 });
}

export async function expectOnLogin(page: Page) {
  await expect(page).toHaveURL(/\/login/);
}
