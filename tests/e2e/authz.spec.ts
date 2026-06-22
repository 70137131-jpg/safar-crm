import { test, expect } from "@playwright/test";
import { login, logout, AGENT_EMAIL, AGENT_PASSWORD } from "./helpers";

/**
 * Ownership authorization (TASKS.md §1.13): an AGENT cannot view a customer
 * they don't own, even by probing the URL directly. The service masks the
 * unauthorized record as a 404 (NotFoundError) — see customers.service.getCustomer.
 */
test("AGENT cannot view another agent's customer via URL probing", async ({ page }) => {
  // Cold dev-server route/action compiles need headroom.
  test.setTimeout(120_000);
  const NAV = 45_000;
  const name = `Authz Customer ${Date.now()}`;

  // As ADMIN, create a customer. The form has no "assigned agent" field, so it
  // is NOT owned by the demo AGENT — exactly what we want to probe.
  await login(page);
  await page.goto("/customers/new");
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create Customer" }).click();
  // Web-first URL assertion (App Router does a client-side navigation here).
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}/, { timeout: NAV });
  const customerId = page.url().split("/customers/")[1]!.split(/[?#]/)[0];

  // Switch to the demo AGENT and probe the customer's detail URL directly.
  await logout(page);
  await login(page, AGENT_EMAIL, AGENT_PASSWORD);
  await page.goto(`/customers/${customerId}`);

  // The page should render the not-found boundary, never the customer.
  await expect(page.getByText("Page not found.")).toBeVisible({ timeout: NAV });
  await expect(page.getByText(name)).toHaveCount(0);
});
