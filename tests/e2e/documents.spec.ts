import { test, expect, type Page } from "@playwright/test";

/**
 * E2E tests for the documents module.
 *
 * Preconditions:
 *   - App running with a seeded ADMIN user (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD).
 *   - R2 configured (R2_* env vars) and reachable — the upload/download tests
 *     exercise the real presigned PUT + gated download path.
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@safarcrm.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "AdminPass1234!";

const PDF_BYTES = Buffer.from("%PDF-1.4\n% E2E test document\n");

async function login(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill("#email", ADMIN_EMAIL);
  await page.fill("#password", ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 10000 });
}

async function createCustomerAndOpenDocs(page: Page): Promise<string> {
  const name = `Docs Test ${Date.now()}`;
  await page.goto(`${BASE_URL}/customers/new`);
  await page.fill("#name", name);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/customers\/[a-z0-9-]+$/, { timeout: 10000 });
  await page.click("text=Documents");
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
