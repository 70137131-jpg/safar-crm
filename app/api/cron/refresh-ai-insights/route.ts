import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { refreshScheduledInsights } from "@/modules/ai-enhancements/ai-enhancements.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await refreshScheduledInsights()) });
  } catch (error) {
    Sentry.captureException(error, { tags: { cron: "refresh-ai-insights" } });
    logger.error({ error }, "cron.refresh_ai_insights_failed");
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
