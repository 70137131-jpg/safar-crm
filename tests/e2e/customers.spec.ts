import { test, expect, type Page } from "@playwright/test";

/**
 * E2E tests for the customers module.
 *
 * Precondition: the app is running with a seeded ADMIN user.
 * Configure SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD in .env for tests.
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@safarcrm.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "AdminPass1234!";

async function login(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill("#email", ADMIN_EMAIL);
  await page.fill("#password", ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 10000 });
}

test.describe("Customers Module", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("create a customer", async ({ page }) => {
    await page.goto(`${BASE_URL}/customers/new`);
    await page.fill("#name", "E2E Test Customer");
    await page.fill("#email", `e2e-${Date.now()}@test.com`);
    await page.fill("#phone", "03001234567");
    await page.fill("#nationality", "PK");
    await page.click('button[type="submit"]');

    // Should redirect to customer detail
    await page.waitForURL("**/customers/**", { timeout: 10000 });
    await expect(page.locator("text=E2E Test Customer")).toBeVisible();
  });

  test("edit a customer", async ({ page }) => {
    // First, create one
    await page.goto(`${BASE_URL}/customers/new`);
    await page.fill("#name", "Edit Me Customer");
    await page.fill("#email", `edit-${Date.now()}@test.com`);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/customers/**", { timeout: 10000 });

    // Navigate to edit
    await page.click("text=Edit");
    await page.waitForURL("**/edit", { timeout: 5000 });
    await page.fill("#name", "Edited Customer");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/customers\/[a-z0-9-]+$/, { timeout: 10000 });
    await expect(page.locator("text=Edited Customer")).toBeVisible();
  });

  test("delete and restore a customer", async ({ page }) => {
    // Create
    await page.goto(`${BASE_URL}/customers/new`);
    const uniqueName = `Delete Test ${Date.now()}`;
    await page.fill("#name", uniqueName);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/customers/**", { timeout: 10000 });

    // Go to list
    await page.goto(`${BASE_URL}/customers`);
    await page.waitForSelector("text=" + uniqueName, { timeout: 5000 });

    // Open actions and delete
    const row = page.locator(`text=${uniqueName}`).locator("..").locator("..");
    await row.locator('[aria-label="Actions"]').click();
    await row.locator("text=Delete").click();
    await page.locator("text=Delete").last().click(); // confirm dialog
    await page.waitForTimeout(1000);

    // Go to trash and restore
    await page.goto(`${BASE_URL}/customers/trash`);
    await expect(page.locator(`text=${uniqueName}`)).toBeVisible({ timeout: 5000 });
    await page.locator(`text=${uniqueName}`).locator("..").locator("..").locator("text=Restore").click();
    await page.locator('button:has-text("Restore")').last().click(); // confirm
  });

  test("customer list is responsive on mobile viewport", async ({ page }) => {
    // Create a customer first
    await page.goto(`${BASE_URL}/customers/new`);
    await page.fill("#name", `Mobile Test ${Date.now()}`);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/customers/**", { timeout: 10000 });

    // Set mobile viewport and visit list
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto(`${BASE_URL}/customers`);

    // Table should be hidden, cards visible
    await expect(page.locator("table")).toBeHidden();
    // Cards should be visible
    const cards = page.locator(".rounded-lg.border.bg-card");
    await expect(cards.first()).toBeVisible({ timeout: 5000 });
  });
});
