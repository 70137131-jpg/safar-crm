import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sweepReminders } from "@/modules/tasks/tasks.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Task reminder sweep (TASKS §1.5) — runs every ~15 min. Emails due OPEN tasks
 * via the outbox. Idempotent (reminderSentAt claim), so a double-fire produces
 * exactly one email per task.
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
    const result = await sweepReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: "sweep-reminders" } });
    logger.error({ err }, "cron.sweep_reminders_failed");
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
