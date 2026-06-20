/**
 * Database seed.
 *
 *   pnpm seed
 *
 * Always: one ADMIN user (created through Better Auth so the password row in
 * `Account` matches Better Auth's hashing). Requires SEED_ADMIN_EMAIL,
 * SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME.
 *
 * When NODE_ENV !== "production": a small demo dataset (agent, settings,
 * customer, lead, quotation, booking, payment, task) — gated per TASKS.md §0.11.
 * The relational rows are written in a single transaction so a mid-way failure
 * cannot leave a partial dataset that the idempotency guard treats as "done".
 */
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

const db = new PrismaClient();

/**
 * Seed-local Better Auth instance.
 *
 * We deliberately do NOT import `@/lib/auth/server` here: that module is
 * Next-coupled (`import "server-only"` + the `nextCookies()` plugin), which
 * throws when run from a plain `tsx`/Node seed process. This instance shares
 * the same database adapter, secret, and email/password settings, so the
 * password hashes it writes verify against the app's auth at login. We disable
 * `autoSignIn` because a seed has no request scope in which to set a cookie.
 */
const seedAuth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    minPasswordLength: 12,
    requireEmailVerification: false,
  },
  user: { modelName: "User" },
  // Match the app: emit UUIDs so they fit the `uuid` User.id column.
  advanced: { database: { generateId: () => randomUUID() } },
});

const DEMO_AGENT_EMAIL = "agent@safarcrm.local";
const DEMO_AGENT_PASSWORD = "DemoAgent!2026";
const DEMO_MANAGER_EMAIL = "manager@safarcrm.local";
const DEMO_MANAGER_PASSWORD = "DemoManager!2026";
const DEMO_ACCOUNTANT_EMAIL = "accountant@safarcrm.local";
const DEMO_ACCOUNTANT_PASSWORD = "DemoAccountant!2026";
const DEMO_CUSTOMER_EMAIL = "demo.customer@safarcrm.local";

/** Create a user via Better Auth, then stamp role + verified. Idempotent. */
async function ensureUser(
  email: string,
  password: string,
  name: string,
  role: "ADMIN" | "MANAGER" | "AGENT" | "ACCOUNTANT",
): Promise<string> {
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    log(`✔ User already exists: ${email} (${existing.role})`);
    return existing.id;
  }

  const result = await seedAuth.api.signUpEmail({ body: { email, password, name } });
  if (!result?.user) throw new Error(`Better Auth sign up returned no user for ${email}`);

  await db.user.update({
    where: { id: result.user.id },
    data: { role, emailVerified: true },
  });
  log(`✔ Seeded ${role}: ${email}`);
  return result.user.id;
}

async function seedAdmin(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@safarcrm.local";
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME ?? "Admin";

  if (!password) {
    log("❌ SEED_ADMIN_PASSWORD must be set (min 12 chars).", "error");
    process.exit(1);
  }
  await ensureUser(email, password, name, "ADMIN");
}

async function seedDemo(): Promise<void> {
  // One demo user per role so all four roles can be exercised in manual QA and
  // RBAC E2E. Created via Better Auth (idempotent) and committed before the
  // demo-data transaction that references the agent. Done BEFORE the demo-data
  // guard so the staff users are ensured even on an already-seeded database.
  const agentId = await ensureUser(
    DEMO_AGENT_EMAIL,
    DEMO_AGENT_PASSWORD,
    "Demo Agent",
    "AGENT",
  );
  await ensureUser(DEMO_MANAGER_EMAIL, DEMO_MANAGER_PASSWORD, "Demo Manager", "MANAGER");
  await ensureUser(
    DEMO_ACCOUNTANT_EMAIL,
    DEMO_ACCOUNTANT_PASSWORD,
    "Demo Accountant",
    "ACCOUNTANT",
  );

  // Idempotency guard — bail from the relational demo dataset if it already exists.
  const already = await db.customer.findFirst({
    where: { email: DEMO_CUSTOMER_EMAIL },
  });
  if (already) {
    log("✔ Demo data already present — skipping.");
    return;
  }

  // All relational rows in one transaction → atomic demo dataset.
  const created = await db.$transaction(async (tx) => {
    // Agency settings (singleton).
    await tx.settings.upsert({
      where: { id: "singleton" },
      update: {},
      create: {
        id: "singleton",
        agencyName: "Safar Travels",
        agencyAddress: "Blue Area, Islamabad, Pakistan",
        agencyPhone: "+924235000000",
        agencyEmail: "hello@safarcrm.local",
        taxRegistrationNo: "NTN-1234567",
        leadSources: ["Walk-in", "WhatsApp", "Referral", "Facebook"],
        defaultTaxBps: 0,
        quoteValidDays: 14,
        passportExpiryWarnDays: 180,
      },
    });

    // Customer.
    const customer = await tx.customer.create({
      data: {
        name: "Ahmed Raza",
        email: DEMO_CUSTOMER_EMAIL,
        phone: "+923001234567",
        nationality: "PK",
        passportNo: "AB1234567",
        passportExpiry: new Date("2027-09-30"),
        address: "F-7 Markaz, Islamabad",
        notes: "Repeat Umrah customer.",
        assignedAgent: { connect: { id: agentId } },
      },
    });

    // Lead (linked to the customer, assigned to the agent).
    const lead = await tx.lead.create({
      data: {
        contactName: "Ahmed Raza",
        contactPhone: "+923001234567",
        contactEmail: DEMO_CUSTOMER_EMAIL,
        customer: { connect: { id: customer.id } },
        status: "CONTACTED",
        source: "WhatsApp",
        destination: "Jeddah",
        tripPurpose: "UMRAH",
        routeShape: "ROUND_TRIP",
        pax: 2,
        budgetPaisa: 60_000_000n, // Rs 600,000.00
        travelDate: new Date("2026-12-15"),
        assignedAgent: { connect: { id: agentId } },
        statusEvents: {
          create: {
            fromStatus: "NEW",
            toStatus: "CONTACTED",
            reason: "Initial WhatsApp follow-up.",
            byUser: { connect: { id: agentId } },
          },
        },
        interactions: {
          create: {
            type: "WHATSAPP",
            body: "Shared Umrah package options for December.",
            createdBy: { connect: { id: agentId } },
          },
        },
      },
    });

    // Quotation (SENT — therefore must carry a quoteNumber) with one line item.
    const quotation = await tx.quotation.create({
      data: {
        quoteNumber: "SQ-2026-000001",
        customer: { connect: { id: customer.id } },
        lead: { connect: { id: lead.id } },
        validTill: new Date("2026-11-30"),
        subtotalPaisa: 50_000_000n, // Rs 500,000.00
        taxPaisa: 0n,
        discountPaisa: 0n,
        totalPaisa: 50_000_000n,
        status: "SENT",
        notes: "Umrah package — 14 nights, 3-star hotels.",
        sentAt: new Date(),
        issuedAt: new Date(),
        items: {
          create: {
            position: 1,
            description: "Umrah package (per person) — flights + hotel + visa",
            quantity: 2,
            unitPricePaisa: 25_000_000n, // Rs 250,000.00
            linePaisa: 50_000_000n, // quantity * unitPricePaisa
          },
        },
      },
    });

    // Booking (confirmed) for the customer.
    const booking = await tx.booking.create({
      data: {
        bookingNumber: "BK-2026-000001",
        customer: { connect: { id: customer.id } },
        lead: { connect: { id: lead.id } },
        travelDate: new Date("2026-12-15"),
        status: "CONFIRMED",
        totalPricePaisa: 50_000_000n, // Rs 500,000.00
        notes: "Confirmed from accepted quotation SQ-2026-000001.",
        confirmedAt: new Date(),
      },
    });

    // Payment (partial) against the booking.
    await tx.payment.create({
      data: {
        booking: { connect: { id: booking.id } },
        amountPaisa: 20_000_000n, // Rs 200,000.00 deposit
        method: "BANK_TRANSFER",
        status: "PAID",
        reference: "TXN-SEED-0001",
        paidAt: new Date(),
        recordedBy: { connect: { id: agentId } },
        notes: "Deposit received.",
      },
    });

    // Task (follow-up) assigned to the agent, attached to the lead.
    const due = new Date();
    due.setDate(due.getDate() + 3);
    await tx.task.create({
      data: {
        title: "Collect remaining balance for BK-2026-000001",
        dueDate: due,
        status: "OPEN",
        type: "FOLLOW_UP",
        lead: { connect: { id: lead.id } },
        assignedTo: { connect: { id: agentId } },
      },
    });

    // Advance number sequences past the manually-assigned demo numbers so the
    // production numbering helper won't collide with the seeded rows.
    await tx.$executeRawUnsafe(`SELECT setval('booking_number_seq', 1, true)`);
    await tx.$executeRawUnsafe(`SELECT setval('quote_number_seq', 1, true)`);

    return { customer: customer.name, quote: quotation.quoteNumber, booking: booking.bookingNumber };
  }, { timeout: 30_000, maxWait: 15_000 }); // tolerate remote (Neon) latency

  log(
    `✔ Seeded demo data: settings, customer "${created.customer}", lead, ` +
      `quotation ${created.quote}, booking ${created.booking}, payment, task`,
  );
}

function log(message: string, level: "log" | "error" = "log"): void {
  // eslint-disable-next-line no-console
  console[level](message);
}

async function main(): Promise<void> {
  await seedAdmin();

  if (process.env.NODE_ENV === "production") {
    log("ℹ Production environment — skipping demo data.");
    return;
  }
  await seedDemo();
}

main()
  .catch((err) => {
    log(String(err?.stack ?? err), "error");
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
