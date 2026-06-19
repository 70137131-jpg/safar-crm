import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { drainEmailOutbox } from "@/lib/email/outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Email outbox drain. Runs frequently (e.g. every few minutes). Idempotent and
 * concurrency-safe (rows are claimed with FOR UPDATE SKIP LOCKED), so Vercel
 * Cron double-fires deliver each email exactly once.
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
    const result = await drainEmailOutbox();
    logger.info(result, "cron.drain_email_outbox");
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: "drain-email-outbox" } });
    logger.error({ err }, "cron.drain_email_outbox_failed");
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
