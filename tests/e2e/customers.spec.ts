import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers";

/**
 * E2E tests for the customers module.
 *
 * Precondition: the app is running with a seeded ADMIN user.
 * Configure SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD in .env for tests.
 */

async function createCustomer(page: Page, name: string) {
  await page.goto("/customers/new");
  const unique = Date.now().toString().slice(-9);
  await expect(async () => {
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Email").fill(`e2e-${unique}@test.com`);
    // The demo seed owns +923001234567, so each test needs a distinct valid
    // Pakistani mobile number.
    await page.getByLabel("Phone").fill(`03${unique}`);
    await page.getByLabel("Nationality").fill("PK");
    await page.getByRole("button", { name: "Create Customer" }).click();
    await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}(?:[?#]|$)/, {
      timeout: 20_000,
    });
  }).toPass({ timeout: 90_000 });
}

test.describe("Customers Module", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("create a customer", async ({ page }) => {
    await createCustomer(page, "E2E Test Customer");
    await expect(page.getByRole("heading", { name: "E2E Test Customer" })).toBeVisible();
  });

  test("edit a customer", async ({ page }) => {
    await createCustomer(page, "Edit Me Customer");

    await page.getByRole("link", { name: "Edit" }).click();
    await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}\/edit(?:[?#]|$)/, { timeout: 10_000 });
    await page.getByLabel("Name").fill("Edited Customer");
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}(?:[?#]|$)/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Edited Customer" })).toBeVisible();
  });

  test("delete and restore a customer", async ({ page }) => {
    const uniqueName = `Delete Test ${Date.now()}`;
    await createCustomer(page, uniqueName);

    // Go to list
    await page.goto("/customers");
    const customerRow = page.getByRole("row", { name: new RegExp(uniqueName) });
    await expect(customerRow).toBeVisible({ timeout: 10_000 });

    // Open actions and delete
    await customerRow.getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete" }).click(); // confirm dialog

    // Go to trash and restore
    await page.goto("/customers/trash");
    const trashedCustomer = page.getByText(uniqueName, { exact: true });
    await expect(trashedCustomer).toBeVisible({ timeout: 10_000 });
    await trashedCustomer
      .locator("xpath=../../..")
      .getByRole("button", { name: "Restore" })
      .click();
    await page.getByRole("button", { name: "Restore" }).click(); // confirm
  });

  test("customer list is responsive on mobile viewport", async ({ page }) => {
    await createCustomer(page, `Mobile Test ${Date.now()}`);

    // Set mobile viewport and visit list
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto("/customers");

    // Table should be hidden, cards visible
    await expect(page.locator("table")).toBeHidden();
    // Cards should be visible
    const cards = page.locator(".rounded-lg.border.bg-card");
    await expect(cards.first()).toBeVisible({ timeout: 5000 });
  });
});
