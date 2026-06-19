/**
 * Foundation smoke test for the Leads + Interactions modules — exercises the
 * real schema → repository → service → audit path (incl. the transactional
 * conversion and OCC) against a live database.
 *
 *   set -a && source .env && set +a && tsx scripts/smoke-leads.ts
 */
import { db } from "@/lib/db";
import type { UserContext } from "@/lib/permissions/types";
import * as leads from "@/modules/leads/leads.service";
import * as interactions from "@/modules/interactions/interactions.service";
import { createLeadSchema } from "@/modules/leads/leads.schemas";

let failures = 0;
function check(label: string, cond: boolean, detail = ""): void {
  // eslint-disable-next-line no-console
  console.log(`${cond ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}
async function expectThrow(label: string, fn: () => Promise<unknown>, substr: string): Promise<void> {
  try {
    await fn();
    check(label, false, "expected an error but none thrown");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    check(label, msg.toLowerCase().includes(substr.toLowerCase()), msg);
  }
}

function randPhone(): string {
  return `03${String(Math.floor(100000000 + Math.random() * 899999999))}`;
}

async function main(): Promise<void> {
  const admin = await db.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  const agent = await db.user.findFirstOrThrow({ where: { role: "AGENT" } });
  const user: UserContext = { id: admin.id, email: admin.email, name: admin.name, role: "ADMIN" };

  const leadIds: string[] = [];
  const customerIds: string[] = [];

  try {
    // ── Lead A: status rules ───────────────────────────────────────────────
    const a = await leads.createLead(user, createLeadSchema.parse({
      contactName: "Smoke Lead A",
      contactPhone: randPhone(),
      destination: "Madinah",
      tripPurpose: "UMRAH",
      pax: "2",
      budget: "500000",
      travelDate: "2027-01-15",
    }));
    leadIds.push(a.id);
    check("createLead returns row (version 0)", a.version === 0);
    check("phone normalized to E.164", a.contactPhone.startsWith("+92"));
    check("budget stored as paisa bigint", a.budgetPaisa === 50_000_000n, String(a.budgetPaisa));

    const a1 = await leads.changeStatus(user, a.id, { status: "CONTACTED", version: a.version });
    check("changeStatus NEW→CONTACTED (OCC bump)", a1.status === "CONTACTED" && a1.version === 1);

    await expectThrow("BOOKED cannot be set manually", () =>
      leads.changeStatus(user, a.id, { status: "BOOKED", version: a1.version }), "converting");
    await expectThrow("TRAVELLED requires BOOKED", () =>
      leads.changeStatus(user, a.id, { status: "TRAVELLED", version: a1.version }), "after it is booked");
    await expectThrow("LOST requires a reason", () =>
      leads.changeStatus(user, a.id, { status: "LOST", version: a1.version }), "reason is required");

    const aLost = await leads.changeStatus(user, a.id, {
      status: "LOST", version: a1.version, lostReason: "NO_RESPONSE", lostNotes: "No reply after 3 calls",
    });
    check("LOST allowed from any stage with reason", aLost.status === "LOST" && aLost.lostReason === "NO_RESPONSE");

    // ── Lead B: assign (OCC) + conversion ──────────────────────────────────
    const b = await leads.createLead(user, createLeadSchema.parse({
      contactName: "Smoke Lead B",
      contactPhone: randPhone(),
      destination: "Jeddah",
      budget: "750000",
      travelDate: "2027-03-20",
    }));
    leadIds.push(b.id);

    await expectThrow("assign with stale version → conflict", () =>
      leads.assignLead(user, b.id, { assignedAgentId: agent.id, version: b.version + 5 }), "changed by someone else");

    const bAssigned = await leads.assignLead(user, b.id, { assignedAgentId: agent.id, version: b.version });
    check("assignLead sets agent (OCC bump)", bAssigned.assignedAgentId === agent.id && bAssigned.version === 1);

    const conv = await leads.convertLead(user, b.id, { version: bAssigned.version });
    customerIds.push(conv.customerId);
    check("convert → BOOKED", conv.lead.status === "BOOKED");
    check("convert mints BK number", /^BK-\d{4}-\d{6}$/.test(conv.bookingNumber), conv.bookingNumber);
    check("convert links customerId", conv.lead.customerId === conv.customerId);
    const booking = await db.booking.findUnique({ where: { id: conv.bookingId } });
    check("booking row created", booking?.bookingNumber === conv.bookingNumber);
    check("booking total = lead budget", booking?.totalPricePaisa === 75_000_000n, String(booking?.totalPricePaisa));

    const bTravelled = await leads.changeStatus(user, b.id, { status: "TRAVELLED", version: conv.lead.version });
    check("BOOKED→TRAVELLED allowed", bTravelled.status === "TRAVELLED");

    await expectThrow("re-convert blocked", () =>
      leads.convertLead(user, b.id, { version: bTravelled.version }), "already been converted");

    // ── Interactions on Lead B ──────────────────────────────────────────────
    const created = await interactions.createInteraction(user, {
      leadId: b.id, type: "CALL", body: "Discussed itinerary",
    });
    check("createInteraction", created.type === "CALL" && created.leadId === b.id);
    const list = await interactions.listByLead(user, b.id);
    check("listByLead includes new + convert-trail NOTE", list.some((i) => i.id === created.id) && list.some((i) => i.type === "NOTE"), `count=${list.length}`);
    const upd = await interactions.updateInteraction(user, created.id, { body: "Discussed itinerary + visa" });
    check("updateInteraction", upd.body.includes("visa"));
    await interactions.deleteInteraction(user, created.id);
    const after = await interactions.listByLead(user, b.id);
    check("deleteInteraction", !after.some((i) => i.id === created.id));

    // ── Audit: mutations recorded, bigint serialized (no throw) ─────────────
    const audits = await db.auditLog.findMany({ where: { entity: "Lead", entityId: b.id } });
    const actions = new Set(audits.map((x) => x.action));
    check("audit has create/assign/convert", actions.has("lead.create") && actions.has("lead.assign") && actions.has("lead.convert"), [...actions].join(","));
    const blob = JSON.stringify(audits);
    check("audit serializes bigint budget as string", blob.includes('"75000000"'));
  } finally {
    // Cleanup in FK-safe order.
    if (leadIds.length) {
      await db.interaction.deleteMany({ where: { leadId: { in: leadIds } } });
      await db.leadStatusEvent.deleteMany({ where: { leadId: { in: leadIds } } });
      await db.booking.deleteMany({ where: { leadId: { in: leadIds } } });
      await db.lead.deleteMany({ where: { id: { in: leadIds } } });
    }
    if (customerIds.length) await db.customer.deleteMany({ where: { id: { in: customerIds } } });
    await db.auditLog.deleteMany({ where: { entityId: { in: [...leadIds, ...customerIds] } } });
    await db.$disconnect();
  }

  // eslint-disable-next-line no-console
  console.log(`\n${failures === 0 ? "✅ ALL LEAD SMOKE CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
