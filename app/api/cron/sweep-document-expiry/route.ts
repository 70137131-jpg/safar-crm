import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sweepDocumentExpiry } from "@/modules/documents/documents.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily document-expiry sweep (ARCHITECTURE.md §9). Vercel Cron sends
 * `Authorization: Bearer <CRON_SECRET>`. Non-matching requests get 401.
 * The sweep itself is idempotent, so a double-fire is safe.
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
    const result = await sweepDocumentExpiry();
    logger.info(result, "cron.sweep_document_expiry");
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: "sweep-document-expiry" } });
    logger.error({ err }, "cron.sweep_document_expiry_failed");
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
