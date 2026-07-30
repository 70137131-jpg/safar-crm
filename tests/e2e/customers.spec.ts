import { test, expect, type Page } from "@playwright/test";

/**
 * E2E tests for the customers module.
 *
 * Runs as the seeded ADMIN via the session saved by `auth.setup.ts` — no
 * per-test sign-in, which would trip the 5/60s rate limit on /sign-in/email.
 *
 * Locators are role/label based. The app's shadcn <Input>s derive their ids
 * from `useId()`, so `#email`-style selectors match nothing — see the note in
 * `helpers.ts`. `baseURL` comes from playwright.config.ts, so paths are relative.
 */

const DETAIL_URL = /\/customers\/[0-9a-f-]{36}$/;
// Cold dev-server route/action compiles need headroom, especially in CI.
const NAV = 45_000;

/**
 * A unique Pakistani mobile number. `phone` is unique per customer and the
 * seed's demo customer holds +923001234567, so tests must not hard-code one.
 * Normalises to +923XXXXXXXXX (see lib/phone/normalize.ts).
 */
function uniquePhone(stamp: number): string {
  return `0300${String(stamp).slice(-7)}`;
}

async function createCustomer(
  page: Page,
  fields: { name: string; email?: string; phone?: string; nationality?: string },
): Promise<string> {
  await page.goto("/customers/new");
  await page.getByLabel("Name").fill(fields.name);
  if (fields.email) await page.getByLabel("Email").fill(fields.email);
  if (fields.phone) await page.getByLabel("Phone").fill(fields.phone);
  if (fields.nationality) {
    await page.getByLabel("Nationality").fill(fields.nationality);
  }
  await page.getByRole("button", { name: "Create Customer" }).click();
  // The App Router does a client-side navigation to the detail page here.
  await expect(page).toHaveURL(DETAIL_URL, { timeout: NAV });
  return page.url().split("/customers/")[1]!.split(/[?#]/)[0]!;
}

test.describe("Customers Module", () => {
  test.beforeEach(() => {
    test.setTimeout(120_000);
  });

  test("create a customer", async ({ page }) => {
    const stamp = Date.now();
    const name = `E2E Test Customer ${stamp}`;
    await createCustomer(page, {
      name,
      email: `e2e-${stamp}@test.com`,
      // Unique per run: phone is unique per customer, and the seed's demo
      // customer already owns +923001234567.
      phone: uniquePhone(stamp),
      nationality: "PK",
    });
    await expect(page.getByText(name).first()).toBeVisible({ timeout: NAV });
  });

  test("edit a customer", async ({ page }) => {
    const stamp = Date.now();
    const id = await createCustomer(page, {
      name: `Edit Me Customer ${stamp}`,
      email: `customer-${stamp}@test.com`,
    });

    // `exact` avoids also matching the mailto: link when the email happens to
    // contain "edit".
    await page.getByRole("link", { name: "Edit", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/customers/${id}/edit$`), {
      timeout: NAV,
    });

    const edited = `Edited Customer ${stamp}`;
    await page.getByLabel("Name").fill(edited);
    await page.getByRole("button", { name: "Save Changes" }).click();

    await expect(page).toHaveURL(DETAIL_URL, { timeout: NAV });
    await expect(page.getByText(edited).first()).toBeVisible({ timeout: NAV });
  });

  test("delete and restore a customer", async ({ page }) => {
    const name = `Delete Test ${Date.now()}`;
    await createCustomer(page, { name });

    // Filter the list down to the new customer so pagination can't hide it.
    await page.goto("/customers");
    await page.getByPlaceholder("Search by name").fill(name);

    // Rows carry no accessible name, so filter by text rather than `{ name }`.
    const row = page.getByRole("row").filter({ hasText: name });
    await expect(row).toBeVisible({ timeout: NAV });

    await row.getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete" }).last().click(); // confirm
    await expect(row).toBeHidden({ timeout: NAV });

    // Soft-deleted customers land in trash, which renders <Card>s rather than
    // table rows — `div.bg-card` is the Card root (components/ui/card.tsx).
    await page.goto("/customers/trash");
    const trashCard = page.locator("div.bg-card").filter({ hasText: name });
    await expect(trashCard).toBeVisible({ timeout: NAV });

    await trashCard.getByRole("button", { name: "Restore" }).click();
    await page.getByRole("button", { name: "Restore" }).last().click(); // confirm
    await expect(trashCard).toBeHidden({ timeout: NAV });
  });

  test("customer list is responsive on mobile viewport", async ({ page }) => {
    const name = `Mobile Test ${Date.now()}`;
    await createCustomer(page, { name });

    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto("/customers");
    await page.getByPlaceholder("Search by name").fill(name);

    // The desktop table wrapper is `hidden … md:block`; cards replace it. The
    // table's copy of the name stays in the DOM but hidden, so scope the
    // assertion to the visible (card) copy.
    await expect(page.locator("table")).toBeHidden({ timeout: NAV });
    await expect(
      page.getByRole("link", { name }).filter({ visible: true }),
    ).toBeVisible({ timeout: NAV });
  });
});
