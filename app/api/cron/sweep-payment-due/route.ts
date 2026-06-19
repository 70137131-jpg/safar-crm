import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sweepPaymentDue } from "@/modules/tasks/tasks.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily payment-due sweep (TASKS §1.5, 07:00 PKT). Creates PAYMENT_DUE tasks
 * for active bookings with an outstanding balance and travel approaching.
 * Idempotent via the partial unique index (one OPEN task per booking).
 */
function authorized(req: Request): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await sweepPaymentDue();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: "sweep-payment-due" } });
    logger.error({ err }, "cron.sweep_payment_due_failed");
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
