import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Email outbox drain tests.
 *
 * Bug under test: `drainEmailOutbox` must NOT hold a DB transaction (and the
 * row's `FOR UPDATE` lock + a pooled connection) open across the Resend network
 * call. The send has to happen OUTSIDE any open transaction; the row is claimed
 * (leased) in a short txn and finalized in a separate short write.
 */

// Tracks whether a db.$transaction callback is currently executing.
let inTransaction = false;
// Captured at the moment resend.send is invoked.
let sentWhileInTransaction: boolean | null = null;

const txQueryRaw = vi.fn();
const txUpdate = vi.fn();
const tx = { $queryRaw: txQueryRaw, emailOutbox: { update: txUpdate } };

const dbFindMany = vi.fn();
const dbUpdate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    emailOutbox: { findMany: (...a: unknown[]) => dbFindMany(...a), update: (...a: unknown[]) => dbUpdate(...a) },
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => {
      inTransaction = true;
      try {
        return await fn(tx);
      } finally {
        inTransaction = false;
      }
    },
  },
}));

let sendThrows = false;
let sendErrorObj: { message?: string } | null = null;
const sendMock = vi.fn(async () => {
  sentWhileInTransaction = inTransaction;
  if (sendThrows) throw new Error("network down");
  return { data: sendErrorObj ? null : { id: "re-1" }, error: sendErrorObj };
});

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: (...a: unknown[]) => sendMock(...(a as [])) };
    constructor(_key: string) {}
  },
}));

vi.mock("@/lib/env", () => ({
  env: { RESEND_API_KEY: "re_test_key", EMAIL_FROM: "noreply@safar.test" },
}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { drainEmailOutbox } = await import("@/lib/email/outbox");

function claimRow(over: Partial<Record<string, unknown>> = {}) {
  return [
    {
      id: "email-1",
      toEmail: "to@x.test",
      subject: "Subject",
      bodyHtml: "<p>hi</p>",
      attempts: 0,
      maxAttempts: 5,
      ...over,
    },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  inTransaction = false;
  sentWhileInTransaction = null;
  sendThrows = false;
  sendErrorObj = null;
  dbFindMany.mockResolvedValue([{ id: "email-1" }]);
  txQueryRaw.mockResolvedValue(claimRow());
  txUpdate.mockResolvedValue({});
  dbUpdate.mockResolvedValue({});
});

describe("drainEmailOutbox", () => {
  it("sends OUTSIDE the DB transaction (no connection/lock held across the network call)", async () => {
    await drainEmailOutbox();
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sentWhileInTransaction).toBe(false);
  });

  it("claims the row with a lease (short txn bumps attempts + pushes scheduledAt forward)", async () => {
    await drainEmailOutbox();
    expect(txUpdate).toHaveBeenCalledTimes(1);
    const arg = txUpdate.mock.calls[0]![0] as { data: { attempts: unknown; scheduledAt: unknown } };
    expect(arg.data.attempts).toEqual({ increment: 1 });
    expect(arg.data.scheduledAt).toBeInstanceOf(Date);
    // lease pushes scheduledAt into the future
    expect((arg.data.scheduledAt as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it("finalizes SENT via a separate write after a successful send", async () => {
    const res = await drainEmailOutbox();
    expect(res).toEqual({ processed: 1, sent: 1, failed: 0 });
    const sentWrite = dbUpdate.mock.calls.find(
      (c) => (c[0] as { data?: { status?: string } })?.data?.status === "SENT",
    );
    expect(sentWrite).toBeTruthy();
  });

  it("on send failure (not exhausted) keeps the row PENDING and retriable now", async () => {
    sendThrows = true;
    txQueryRaw.mockResolvedValue(claimRow({ attempts: 0, maxAttempts: 5 }));
    const res = await drainEmailOutbox();
    expect(res).toEqual({ processed: 1, sent: 0, failed: 1 });
    const fin = dbUpdate.mock.calls[0]![0] as { data: { status: string; scheduledAt: Date } };
    expect(fin.data.status).toBe("PENDING");
    // lease released so it retries on the next drain
    expect(fin.data.scheduledAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("marks FAILED once attempts reach maxAttempts", async () => {
    sendThrows = true;
    txQueryRaw.mockResolvedValue(claimRow({ attempts: 4, maxAttempts: 5 }));
    const res = await drainEmailOutbox();
    expect(res.failed).toBe(1);
    const fin = dbUpdate.mock.calls[0]![0] as { data: { status: string } };
    expect(fin.data.status).toBe("FAILED");
  });

  it("treats a Resend error result as a failure", async () => {
    sendErrorObj = { message: "rejected" };
    const res = await drainEmailOutbox();
    expect(res.sent).toBe(0);
    expect(res.failed).toBe(1);
  });

  it("skips a row already claimed by another drainer (SKIP LOCKED returns nothing)", async () => {
    txQueryRaw.mockResolvedValue([]);
    const res = await drainEmailOutbox();
    expect(res).toEqual({ processed: 0, sent: 0, failed: 0 });
    expect(sendMock).not.toHaveBeenCalled();
  });
});
