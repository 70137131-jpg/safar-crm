/**
 * Foundation smoke test for the Customers module — exercises the real
 * schema → repository → service → audit path against a live database.
 *
 * Run (with env loaded):
 *   set -a && source .env && set +a && tsx scripts/smoke-customers.ts
 *
 * Mirrors what the server actions do (Zod parse → service call), but bypasses
 * the auth/session layer by constructing a UserContext from the seeded ADMIN.
 * Cleans up after itself (hard-deletes the test customer + its audit rows).
 */
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import type { UserContext } from "@/lib/permissions/types";
import * as customers from "@/modules/customers/customers.service";
import {
  createCustomerSchema,
  updateCustomerSchema,
  searchCustomersSchema,
} from "@/modules/customers/customers.schemas";

let failures = 0;
function check(label: string, cond: boolean, detail = ""): void {
  // eslint-disable-next-line no-console
  console.log(`${cond ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

async function main(): Promise<void> {
  const admin = await db.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  const user: UserContext = {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: "ADMIN",
  };

  const tag = randomUUID().slice(0, 8);
  const phone = `03${String(Math.floor(100000000 + Math.random() * 899999999))}`;
  let id = "";

  try {
    // 1) CREATE (with a passport, to exercise PII redaction in the audit row).
    const createInput = createCustomerSchema.parse({
      name: `Smoke ${tag}`,
      email: `smoke.${tag}@example.com`,
      phone,
      nationality: "PK",
      passportNo: "ZZ9988776",
    });
    const created = await customers.createCustomer(user, createInput);
    id = created.id;
    check("createCustomer returns a row", Boolean(created.id));
    check("phone normalized to E.164", created.phone?.startsWith("+92") ?? false, created.phone ?? "null");
    check("initial OCC version is 0", created.version === 0, `version=${created.version}`);

    // 2) UPDATE (rename) — expect version increment.
    const updateInput = updateCustomerSchema.parse({
      name: `Smoke ${tag} Updated`,
      email: `smoke.${tag}@example.com`,
      phone,
      nationality: "PK",
      passportNo: "ZZ9988776",
    });
    const updated = await customers.updateCustomer(user, id, updateInput);
    check("updateCustomer applied rename", updated.name.endsWith("Updated"), updated.name);
    check("OCC version incremented to 1", updated.version === 1, `version=${updated.version}`);

    // 3) SEARCH — find by the unique tag.
    const found = await customers.searchCustomers(user, searchCustomersSchema.parse({ query: tag }));
    check("searchCustomers finds the customer", found.items.some((c) => c.id === id), `total=${found.total}`);

    // 4) DETAIL — the data the [id] page renders.
    const detail = await customers.getCustomer(user, id);
    check("getCustomer returns detail", detail.id === id && detail.name.endsWith("Updated"));

    // 5) AUDIT — create + update rows written, passport masked to last-4.
    const audits = await db.auditLog.findMany({
      where: { entity: "Customer", entityId: id },
      orderBy: { createdAt: "asc" },
    });
    check("audit rows written (create + update)", audits.length >= 2, `count=${audits.length}`);
    const blob = JSON.stringify(audits);
    check("PII redaction: raw passport NOT in audit", !blob.includes("ZZ9988776"));
    check("PII redaction: passport masked to last-4 (****8776)", blob.includes("****8776"));

    // 6) SOFT DELETE via service.
    const deleted = await customers.deleteCustomer(user, id);
    check("deleteCustomer sets deletedAt (soft)", deleted.deletedAt !== null);
    const afterDelete = await customers.searchCustomers(user, searchCustomersSchema.parse({ query: tag }));
    check("soft-deleted row excluded from search", !afterDelete.items.some((c) => c.id === id));
  } finally {
    // Cleanup — hard remove the test customer + its audit trail.
    if (id) {
      await db.auditLog.deleteMany({ where: { entity: "Customer", entityId: id } });
      await db.customer.delete({ where: { id } }).catch(() => {});
    }
    await db.$disconnect();
  }

  // eslint-disable-next-line no-console
  console.log(`\n${failures === 0 ? "✅ ALL SMOKE CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
