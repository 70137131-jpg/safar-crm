import { test, expect } from "@playwright/test";
import { login, logout, ADMIN_EMAIL, ADMIN_PASSWORD } from "./helpers";

/**
 * Authentication & session E2E.
 * Precondition: app running with the seeded admin (SEED_ADMIN_EMAIL/PASSWORD).
 */

test.describe("Authentication", () => {
  test("logs in with valid credentials and lands on the dashboard", async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("link", { name: "Customers" })).toBeVisible();
  });

  test("rejects an invalid password and stays on /login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(ADMIN_EMAIL);
    await page.getByLabel("Password").fill("wrong-password-123");
    await page.getByRole("button", { name: /sign in/i }).click();
    // Stays on login; an error toast appears; never reaches the dashboard.
    await expect(page.getByText(/sign in failed|invalid/i)).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("persists the session across reload and direct navigation", async ({ page }) => {
    await login(page);
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/);
    // Direct navigation to a protected route stays authenticated.
    await page.goto("/customers");
    await expect(page).toHaveURL(/\/customers/);
    await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
  });

  test("logs out and then blocks protected routes", async ({ page }) => {
    await login(page);
    await logout(page);
    await expect(page).toHaveURL(/\/login/);
    // After logout, a protected route redirects back to login.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("redirects an unauthenticated visitor from a protected route to /login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/customers");
    await expect(page).toHaveURL(/\/login/);
  });
});
