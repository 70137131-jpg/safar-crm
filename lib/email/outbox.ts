import "server-only";
import { Resend } from "resend";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Transactional email outbox.
 *
 *   - Services call `enqueueEmail(tx, …)` inside the same transaction as the
 *     triggering mutation, so the email row and the mutation commit together
 *     (or not at all). Services never send email inline.
 *   - A cron calls `drainEmailOutbox()` to deliver PENDING rows via Resend.
 *     The drain is idempotent: each row is claimed with `FOR UPDATE SKIP
 *     LOCKED`, so a Vercel Cron double-fire (or overlapping runs) delivers each
 *     email exactly once.
 *   - Bodies link to gated download pages — never embed signed R2 URLs.
 */

type TxClient = typeof db | Prisma.TransactionClient;

export interface EnqueueEmailInput {
  toEmail: string;
  subject: string;
  bodyHtml: string;
  relatedType?: string;
  relatedId?: string;
}

export async function enqueueEmail(tx: TxClient, input: EnqueueEmailInput): Promise<void> {
  await tx.emailOutbox.create({
    data: {
      toEmail: input.toEmail,
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      relatedType: input.relatedType ?? null,
      relatedId: input.relatedId ?? null,
    },
  });
}

export interface DrainResult {
  processed: number;
  sent: number;
  failed: number;
}

/** Lease window: a claimed row is hidden from other drainers for this long.
 * Shorter than the drain cron interval so a crashed-mid-send row self-heals on
 * the next run; longer than a normal Resend round-trip. */
const CLAIM_LEASE_MS = 2 * 60 * 1000;

type ClaimedRow = {
  id: string;
  toEmail: string;
  subject: string;
  bodyHtml: string;
  attempts: number;
  maxAttempts: number;
};

/**
 * Deliver up to `batchSize` due PENDING emails. Safe to run concurrently and
 * repeatedly.
 *
 * Each row is processed in three steps so the Resend network call never runs
 * inside a DB transaction (which would pin a pooled Neon connection and hold the
 * row's `FOR UPDATE` lock for the whole HTTP round-trip):
 *   1. CLAIM   — short txn: lock with `FOR UPDATE SKIP LOCKED`, bump `attempts`,
 *                and lease the row by pushing `scheduledAt` into the future so
 *                concurrent/overlapping drainers skip it.
 *   2. SEND    — outside any transaction; no connection or lock held.
 *   3. FINALIZE — short write: mark SENT, or FAILED (attempts exhausted), or
 *                 release the lease (`scheduledAt = now`) to retry next drain.
 * Delivery stays at-least-once and idempotent; a crash between CLAIM and
 * FINALIZE just delays retry until the lease expires.
 */
export async function drainEmailOutbox(batchSize = 25): Promise<DrainResult> {
  const from = env.EMAIL_FROM;
  if (!env.RESEND_API_KEY || !from) {
    logger.warn({}, "outbox.drain_skipped_no_email_config");
    return { processed: 0, sent: 0, failed: 0 };
  }
  const resend = new Resend(env.RESEND_API_KEY);

  const candidates = await db.emailOutbox.findMany({
    where: { status: "PENDING", scheduledAt: { lte: new Date() } },
    orderBy: { scheduledAt: "asc" },
    take: batchSize,
    select: { id: true },
  });

  let sent = 0;
  let failed = 0;
  let processed = 0;

  for (const { id } of candidates) {
    // 1. CLAIM — short transaction, no network call inside.
    const claimed = await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<ClaimedRow[]>`
        SELECT id, "toEmail", subject, "bodyHtml", attempts, "maxAttempts"
        FROM "EmailOutbox"
        WHERE id = ${id}::uuid AND status = 'PENDING' AND "scheduledAt" <= now()
        FOR UPDATE SKIP LOCKED`;
      const row = rows[0];
      if (!row) return null; // already taken / no longer pending

      await tx.emailOutbox.update({
        where: { id: row.id },
        data: { attempts: { increment: 1 }, scheduledAt: new Date(Date.now() + CLAIM_LEASE_MS) },
      });
      return row;
    });
    if (!claimed) continue;
    processed++;

    const attempts = claimed.attempts + 1; // reflects the increment from CLAIM

    // 2. SEND — outside the transaction.
    try {
      const { error } = await resend.emails.send({
        from,
        to: claimed.toEmail,
        subject: claimed.subject,
        html: claimed.bodyHtml,
      });
      if (error) throw new Error(error.message ?? "Resend error");

      // 3. FINALIZE success.
      await db.emailOutbox.update({
        where: { id: claimed.id },
        data: { status: "SENT", sentAt: new Date() },
      });
      sent++;
    } catch (err) {
      const exhausted = attempts >= claimed.maxAttempts;
      // 3. FINALIZE failure: exhaust -> FAILED, else release the lease to retry.
      await db.emailOutbox.update({
        where: { id: claimed.id },
        data: {
          status: exhausted ? "FAILED" : "PENDING",
          scheduledAt: exhausted ? undefined : new Date(),
          lastError: err instanceof Error ? err.message.slice(0, 500) : "send failed",
        },
      });
      failed++;
      logger.error({ err, emailId: claimed.id, attempts, exhausted }, "outbox.send_failed");
    }
  }

  return { processed, sent, failed };
}
