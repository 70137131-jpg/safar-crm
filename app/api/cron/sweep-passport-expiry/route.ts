import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sweepPassportExpiry } from "@/modules/tasks/tasks.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily passport-expiry sweep (TASKS §1.5, 06:00 PKT). Creates PASSPORT_EXPIRY
 * tasks for customers whose passports expire within the configured window.
 * Idempotent via the partial unique index (one OPEN task per customer).
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
    const result = await sweepPassportExpiry();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: "sweep-passport-expiry" } });
    logger.error({ err }, "cron.sweep_passport_expiry_failed");
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
