import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * Critical path (TASKS.md §1.13): create a lead → convert it to a booking →
 * record a payment against that booking. Drives the real `convertLead`
 * (atomic customer + booking + interaction trail) and `recordPayment` services
 * through the UI.
 *
 * Conversion is only available from the leads *list* view (the detail page has
 * no convert action), via the per-row "Change status" → BOOKED, which opens the
 * convert dialog.
 *
 * Robustness notes for dev-mode runs (CI also uses `pnpm dev`):
 *  - `expect(page).toHaveURL` (not waitForURL) — App Router does client-side
 *    navigation, which never fires the `load` event waitForURL waits on.
 *  - Each freshly-loaded page is gated on a post-hydration signal (data-driven
 *    content) before interacting, and form submits are wrapped in `toPass`, so a
 *    pre-hydration no-op submit is retried rather than failing the run.
 */
test("lead → convert → booking → payment", async ({ page }) => {
  test.setTimeout(240_000);
  const NAV = 45_000;
  const name = `E2E Flow ${Date.now()}`;

  await login(page); // seeded ADMIN

  // 1. Create the lead (retry the submit until the page is hydrated and navigates).
  await page.goto("/leads/new");
  await expect(async () => {
    await page.getByLabel("Contact Name").fill(name);
    await page.getByLabel("Phone").fill("03001234567");
    await page.getByLabel("Budget (PKR)").fill("500000");
    await page.getByRole("button", { name: "Create Lead" }).click();
    await expect(page).toHaveURL(/\/leads\/[0-9a-f-]{36}/, { timeout: 20_000 });
  }).toPass({ timeout: 90_000 });

  // 2. Convert from the list view, narrowed to just this lead. Waiting for the
  //    data-driven row confirms the client list has hydrated + fetched.
  await page.goto(`/leads?view=list&q=${encodeURIComponent(name)}`);
  await expect(page.getByRole("link", { name })).toBeVisible({ timeout: NAV });
  const statusSelect = page.getByLabel("Change status");
  await expect(async () => {
    await statusSelect.selectOption("BOOKED");
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });

  // 3. Confirm conversion in the dialog (explicit total so the booking has a
  //    non-zero balance to pay down).
  const convertDialog = page.getByRole("dialog");
  await convertDialog.locator('input[inputmode="decimal"]').fill("500000");
  await convertDialog.getByRole("button", { name: "Convert Lead" }).click();
  await expect(page.getByText(/Converted — booking BK-/)).toBeVisible({ timeout: NAV });

  // 4. Open the new booking from the bookings list (search matches customer name).
  await page.goto("/bookings");
  await expect(page.getByRole("link", { name: /^BK-/ }).first()).toBeVisible({ timeout: NAV });
  await page.getByRole("searchbox").fill(name);
  const bookingLink = page.getByRole("link", { name: /^BK-/ });
  await expect(bookingLink).toHaveCount(1, { timeout: 15_000 });
  await bookingLink.click();
  await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]{36}/, { timeout: NAV });

  // 5. Record a payment (Payments tab → dialog). Retry until the tab is
  //    hydrated and the dialog opens.
  await expect(async () => {
    await page.getByRole("button", { name: "Payments" }).click();
    await page.getByRole("button", { name: "Record Payment" }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
  const payDialog = page.getByRole("dialog");
  await payDialog.locator('input[inputmode="decimal"]').fill("100000");
  await payDialog.getByRole("button", { name: "Record Payment" }).click();

  // 6. Receipt is recorded and shows in the ledger.
  await expect(page.getByText("Payment recorded")).toBeVisible({ timeout: NAV });
  await expect(page.getByText("Cash").first()).toBeVisible();
});
