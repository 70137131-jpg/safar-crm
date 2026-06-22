import { test, expect } from "@playwright/test";

/**
 * Login lockout (TASKS.md §1.13). Better Auth rate-limits `/sign-in/email` to
 * 5 requests per 60s (lib/auth/server.ts); the 6th returns 429 with
 * "Too many requests. Please try again later.", surfaced as a toast.
 *
 * IMPORTANT: this spec deliberately trips the per-IP rate limit, which is shared
 * across the whole suite for ~60s. It is named to sort LAST so that under CI
 * (workers=1, files run in sorted order) no later spec's login() is affected.
 * It is isolated in its own file and runs serially for the same reason.
 */
test.describe.configure({ mode: "serial" });

test("rate-limits repeated failed login attempts", async ({ page }) => {
  const email = `lockout-${Date.now()}@safarcrm.local`;

  await page.goto("/login");
  for (let i = 0; i < 6; i++) {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("wrong-password-123");
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForTimeout(400); // let the response + toast settle
  }

  // Better Auth returns "Too many requests. Please try again later." once the
  // 5/60s window is exceeded; several attempts can stack the toast, so scope to
  // the first match.
  await expect(
    page.getByText(/too many requests|try again later/i).first(),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveURL(/\/login/);
});
