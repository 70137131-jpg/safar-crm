import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Cron HTTP layer tests — every cron endpoint must be gated behind the
 * `Authorization: Bearer <CRON_SECRET>` check so it cannot be triggered
 * publicly. The sweep *logic* (idempotency) is covered in the service unit
 * tests; here we verify the route auth gate and delegation.
 */

vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "test-secret" } }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const sweepReminders = vi.fn(async () => ({ scanned: 0, emailed: 0 }));
const sweepPassportExpiry = vi.fn(async () => ({ created: 0 }));
const sweepPaymentDue = vi.fn(async () => ({ created: 0 }));
vi.mock("@/modules/tasks/tasks.service", () => ({ sweepReminders, sweepPassportExpiry, sweepPaymentDue }));

const sweepQuotationExpiry = vi.fn(async () => ({ expired: 0 }));
vi.mock("@/modules/quotations/quotations.service", () => ({ sweepQuotationExpiry }));

const sweepDocumentExpiry = vi.fn(async () => ({ created: 0 }));
vi.mock("@/modules/documents/documents.service", () => ({ sweepDocumentExpiry }));

const drainEmailOutbox = vi.fn(async () => ({ sent: 0, failed: 0 }));
vi.mock("@/lib/email/outbox", () => ({ drainEmailOutbox }));

type RouteMod = { GET: (req: Request) => Promise<Response> };

const ROUTES = [
  { name: "sweep-reminders", sweep: sweepReminders, load: () => import("@/app/api/cron/sweep-reminders/route") },
  { name: "sweep-passport-expiry", sweep: sweepPassportExpiry, load: () => import("@/app/api/cron/sweep-passport-expiry/route") },
  { name: "sweep-payment-due", sweep: sweepPaymentDue, load: () => import("@/app/api/cron/sweep-payment-due/route") },
  { name: "sweep-quotation-expiry", sweep: sweepQuotationExpiry, load: () => import("@/app/api/cron/sweep-quotation-expiry/route") },
  { name: "sweep-document-expiry", sweep: sweepDocumentExpiry, load: () => import("@/app/api/cron/sweep-document-expiry/route") },
  { name: "drain-email-outbox", sweep: drainEmailOutbox, load: () => import("@/app/api/cron/drain-email-outbox/route") },
] as const;

async function getHandler(load: () => Promise<unknown>) {
  return ((await load()) as RouteMod).GET;
}

function req(name: string, auth?: string) {
  return new Request(`http://localhost/api/cron/${name}`, {
    headers: auth ? { authorization: auth } : {},
  });
}

beforeEach(() => vi.clearAllMocks());

describe.each(ROUTES)("cron route /api/cron/$name", ({ name, sweep, load }) => {
  it("rejects an unauthenticated request with 401", async () => {
    const GET = await getHandler(load);
    const res = await GET(req(name));
    expect(res.status).toBe(401);
    expect(sweep).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret with 401", async () => {
    const GET = await getHandler(load);
    const res = await GET(req(name, "Bearer wrong-secret"));
    expect(res.status).toBe(401);
    expect(sweep).not.toHaveBeenCalled();
  });

  it("runs the sweep with the correct bearer secret", async () => {
    const GET = await getHandler(load);
    const res = await GET(req(name, "Bearer test-secret"));
    expect(res.status).toBe(200);
    expect(sweep).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("is safe to invoke repeatedly (double-fire delegates each time)", async () => {
    const GET = await getHandler(load);
    await GET(req(name, "Bearer test-secret"));
    await GET(req(name, "Bearer test-secret"));
    expect(sweep).toHaveBeenCalledTimes(2);
  });
});
