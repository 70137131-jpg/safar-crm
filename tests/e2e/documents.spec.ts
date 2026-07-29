import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers";

/**
 * E2E tests for the documents module.
 *
 * Preconditions:
 *   - App running with a seeded ADMIN user (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD).
 *   - R2 configured (R2_* env vars) and reachable — the upload/download tests
 *     exercise the real presigned PUT + gated download path.
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

const PDF_BYTES = Buffer.from("%PDF-1.4\n% E2E test document\n");

async function createCustomerAndOpenDocs(page: Page): Promise<string> {
  const name = `Docs Test ${Date.now()}`;
  await page.goto("/customers/new");
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create Customer" }).click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}(?:[?#]|$)/, { timeout: 20_000 });
  await page.getByRole("button", { name: "Documents" }).click();
  return name;
}

async function uploadPdf(page: Page, fileName: string) {
  await page.setInputFiles('input[type="file"]', {
    name: fileName,
    mimeType: "application/pdf",
    buffer: PDF_BYTES,
  });
  await expect(page.locator(`text=${fileName}`)).toBeVisible({ timeout: 20000 });
}

test.describe("Documents Module", () => {
  test.skip(
    !process.env.R2_ACCOUNT_ID ||
      !process.env.R2_ACCESS_KEY_ID ||
      !process.env.R2_SECRET_ACCESS_KEY,
    "Document E2E requires configured R2 credentials.",
  );

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("upload a document and see it listed", async ({ page }) => {
    await createCustomerAndOpenDocs(page);
    const fileName = `e2e-passport-${Date.now()}.pdf`;
    await uploadPdf(page, fileName);

    // The download link points at the gated route, never a raw bucket URL.
    const link = page.locator(`a[href^="/api/documents/"][href$="/download"]`).first();
    await expect(link).toBeVisible();
  });

  test("download link routes through the gated endpoint", async ({ page }) => {
    await createCustomerAndOpenDocs(page);
    const fileName = `e2e-download-${Date.now()}.pdf`;
    await uploadPdf(page, fileName);

    const href = await page
      .locator(`a[href^="/api/documents/"][href$="/download"]`)
      .first()
      .getAttribute("href");
    expect(href).toMatch(/^\/api\/documents\/[a-z0-9-]+\/download$/);

    // Following it lands on a Cloudflare R2 signed URL (302), not a public URL.
    const resp = await page.request.get(`${BASE_URL}${href}`, { maxRedirects: 0 });
    expect([302, 307]).toContain(resp.status());
    expect(resp.headers()["location"]).toContain("r2.cloudflarestorage.com");
  });

  test("delete a document", async ({ page }) => {
    await createCustomerAndOpenDocs(page);
    const fileName = `e2e-delete-${Date.now()}.pdf`;
    await uploadPdf(page, fileName);

    await page.locator('button[title="Delete"]').first().click();
    await page.locator('button:has-text("Delete")').last().click(); // confirm dialog
    await expect(page.locator(`text=${fileName}`)).toBeHidden({ timeout: 10000 });
  });

  test("documents render as cards on a mobile viewport", async ({ page }) => {
    await createCustomerAndOpenDocs(page);
    const fileName = `e2e-mobile-${Date.now()}.pdf`;
    await uploadPdf(page, fileName);

    await page.setViewportSize({ width: 360, height: 640 });
    // The desktop table is hidden under 640px; the card list shows the file.
    await expect(page.locator(`text=${fileName}`)).toBeVisible();
  });

  test("unauthenticated download is redirected to login", async ({ page }) => {
    await createCustomerAndOpenDocs(page);
    const fileName = `e2e-auth-${Date.now()}.pdf`;
    await uploadPdf(page, fileName);
    const href = await page
      .locator(`a[href^="/api/documents/"][href$="/download"]`)
      .first()
      .getAttribute("href");

    await page.context().clearCookies();
    const resp = await page.request.get(`${BASE_URL}${href}`, { maxRedirects: 0 });
    expect([302, 307]).toContain(resp.status());
    expect(resp.headers()["location"]).toContain("/login");
  });
});
