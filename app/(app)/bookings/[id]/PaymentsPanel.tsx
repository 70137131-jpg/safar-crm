"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Undo2, Ban, Wallet } from "lucide-react";
import { toast } from "sonner";
import type { PaymentMethod } from "@prisma/client";
import { cn } from "@/lib/cn";
import { formatPKR, toPKR } from "@/lib/money/paisa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listPaymentsAction,
  getBookingBalanceAction,
  recordPaymentAction,
  refundPaymentAction,
  voidPaymentAction,
} from "@/modules/payments/payments.actions";
import type {
  PaymentDTO,
  BookingBalanceDTO,
} from "@/modules/payments/payments.types";
import { formatBookingDateTime } from "../bookingMeta";

const selectCls =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const textareaCls =
  "flex min-h-[70px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  CARD: "Card",
  OTHER: "Other",
};
const ALL_METHODS: PaymentMethod[] = ["CASH", "BANK_TRANSFER", "CARD", "OTHER"];

function newIdemKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

function todayInput(): string {
  return new Date().toISOString().split("T")[0] ?? "";
}

export interface PaymentCaps {
  canRecord: boolean;
  canRefund: boolean;
  /** AGENTs may only record CASH. */
  cashOnly: boolean;
}

export function PaymentsPanel({
  bookingId,
  bookingStatus,
  caps,
}: {
  bookingId: string;
  bookingStatus: string;
  caps: PaymentCaps;
}) {
  const [balance, setBalance] = useState<BookingBalanceDTO | null>(null);
  const [payments, setPayments] = useState<PaymentDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordOpen, setRecordOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [bal, list] = await Promise.all([
      getBookingBalanceAction(bookingId),
      listPaymentsAction({ bookingId }),
    ]);
    if (bal.ok) setBalance(bal.data);
    else toast.error(bal.message);
    if (list.ok) setPayments(list.data);
    else toast.error(list.message);
    setLoading(false);
  }, [bookingId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const isCancelled = bookingStatus === "CANCELLED";
  const outstanding = balance ? balance.balancePaisa : 0n;
  const collected = balance ? balance.collectedPaisa : 0n;

  return (
    <div className="space-y-5">
      {/* Balance summary */}
      <div className="rounded-lg border bg-card p-4">
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Total" value={balance ? formatPKR(balance.totalPaisa) : "—"} />
          <Stat label="Collected" value={balance ? formatPKR(collected) : "—"} />
          <Stat
            label="Balance"
            value={balance ? formatPKR(outstanding) : "—"}
            tone={
              balance
                ? balance.fullyPaid
                  ? "success"
                  : outstanding > 0n
                    ? "danger"
                    : "neutral"
                : "neutral"
            }
          />
        </div>
        {balance?.fullyPaid && (
          <div className="mt-3">
            <StatusBadge tone="success">Fully paid</StatusBadge>
          </div>
        )}

        {(caps.canRecord || caps.canRefund) && !isCancelled && (
          <div className="mt-4 flex flex-wrap gap-2">
            {caps.canRecord && outstanding > 0n && (
              <Button size="sm" onClick={() => setRecordOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Record Payment
              </Button>
            )}
            {caps.canRefund && collected > 0n && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRefundOpen(true)}
              >
                <Undo2 className="mr-2 h-4 w-4" />
                Refund
              </Button>
            )}
          </div>
        )}
        {isCancelled && (
          <p className="mt-3 text-xs text-muted-foreground">
            This booking is cancelled — new payments can&apos;t be recorded. Past
            payment rows are preserved; refunds remain available.
          </p>
        )}
        {/* A cancelled booking can still be refunded. */}
        {isCancelled && caps.canRefund && collected > 0n && (
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={() => setRefundOpen(true)}>
              <Undo2 className="mr-2 h-4 w-4" />
              Refund
            </Button>
          </div>
        )}
      </div>

      {/* Ledger */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : payments.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-8 w-8" />}
          title="No payments yet"
          description="Recorded receipts and refunds will appear here."
        />
      ) : (
        <ul className="space-y-2">
          {payments.map((p) => (
            <PaymentRow
              key={p.id}
              payment={p}
              canVoid={caps.canRefund}
              onChanged={fetchAll}
            />
          ))}
        </ul>
      )}

      <RecordPaymentDialog
        open={recordOpen}
        onOpenChange={setRecordOpen}
        bookingId={bookingId}
        cashOnly={caps.cashOnly}
        outstandingHint={outstanding}
        onDone={fetchAll}
      />
      <RefundDialog
        open={refundOpen}
        onOpenChange={setRefundOpen}
        bookingId={bookingId}
        collectedHint={collected}
        onDone={fetchAll}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "danger";
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-sm font-semibold tabular-nums sm:text-base",
          tone === "success" && "text-green-600 dark:text-green-500",
          tone === "danger" && "text-red-600 dark:text-red-400",
        )}
      >
        {value}
      </p>
    </div>
  );
}

// ─── Ledger row ───────────────────────────────────────────────────────────────

function PaymentRow({
  payment,
  canVoid,
  onChanged,
}: {
  payment: PaymentDTO;
  canVoid: boolean;
  onChanged: () => void;
}) {
  const [voidOpen, setVoidOpen] = useState(false);
  const isRefund = payment.amountPaisa < 0n;
  const isVoided = payment.status === "VOIDED";

  return (
    <li className="rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "text-sm font-semibold tabular-nums",
                isVoided && "text-muted-foreground line-through",
                !isVoided && isRefund && "text-red-600 dark:text-red-400",
              )}
            >
              {formatPKR(payment.amountPaisa)}
            </span>
            {isRefund && <StatusBadge tone="warning">Refund</StatusBadge>}
            {isVoided && <StatusBadge tone="danger">Voided</StatusBadge>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {METHOD_LABEL[payment.method]} · {formatBookingDateTime(payment.paidAt)}
            {payment.recordedBy ? ` · ${payment.recordedBy.name}` : ""}
          </p>
          {payment.reference && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Ref: {payment.reference}
            </p>
          )}
          {payment.notes && (
            <p className="mt-0.5 text-xs text-muted-foreground">{payment.notes}</p>
          )}
          {isVoided && payment.voidReason && (
            <p className="mt-0.5 text-xs italic text-muted-foreground">
              Void reason: {payment.voidReason}
            </p>
          )}
        </div>
        {canVoid && !isVoided && (
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => setVoidOpen(true)}
          >
            <Ban className="mr-1 h-3.5 w-3.5" />
            Void
          </Button>
        )}
      </div>

      <VoidDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        paymentId={payment.id}
        onDone={onChanged}
      />
    </li>
  );
}

// ─── Record dialog ────────────────────────────────────────────────────────────

function RecordPaymentDialog({
  open,
  onOpenChange,
  bookingId,
  cashOnly,
  outstandingHint,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bookingId: string;
  cashOnly: boolean;
  outstandingHint: bigint;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState(todayInput);
  const [notes, setNotes] = useState("");
  // Stable per form session; regenerated by reset() so a retry of the *same*
  // submission replays server-side instead of double-charging.
  const [idemKey, setIdemKey] = useState(newIdemKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setAmount("");
    setMethod("CASH");
    setReference("");
    setNotes("");
    setError(null);
    setPaidAt(todayInput());
    setIdemKey(newIdemKey());
  }

  async function submit() {
    setError(null);
    if (!amount.trim()) {
      setError("Amount is required.");
      return;
    }
    setBusy(true);
    try {
      const r = await recordPaymentAction({
        bookingId,
        amount,
        method,
        reference,
        paidAt,
        notes,
        idempotencyKey: idemKey,
      });
      if (r.ok) {
        toast.success("Payment recorded");
        onOpenChange(false);
        reset();
        onDone();
      } else {
        toast.error(r.message);
      }
    } finally {
      setBusy(false);
    }
  }

  const methods = cashOnly ? (["CASH"] as PaymentMethod[]) : ALL_METHODS;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            Outstanding balance: {formatPKR(outstandingHint)}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">
                Amount (PKR) <span className="text-destructive">*</span>
              </label>
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={toPKR(outstandingHint)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">Method</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                className={selectCls}
                disabled={cashOnly}
              >
                {methods.map((m) => (
                  <option key={m} value={m}>
                    {METHOD_LABEL[m]}
                  </option>
                ))}
              </select>
              {cashOnly && (
                <p className="text-xs text-muted-foreground">
                  Agents may only record cash payments.
                </p>
              )}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">Date received</label>
              <Input
                type="date"
                value={paidAt}
                max={new Date().toISOString().split("T")[0]}
                onChange={(e) => setPaidAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">Reference</label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Receipt / txn #"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={textareaCls}
              placeholder="Optional"
            />
          </div>
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={busy}>
            {busy ? "Recording…" : "Record Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Refund dialog ────────────────────────────────────────────────────────────

function RefundDialog({
  open,
  onOpenChange,
  bookingId,
  collectedHint,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bookingId: string;
  collectedHint: bigint;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [reason, setReason] = useState("");
  const [idemKey, setIdemKey] = useState(newIdemKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setAmount("");
    setMethod("CASH");
    setReason("");
    setError(null);
    setIdemKey(newIdemKey());
  }

  async function submit() {
    setError(null);
    if (!amount.trim()) {
      setError("Amount is required.");
      return;
    }
    if (!reason.trim()) {
      setError("A refund reason is required.");
      return;
    }
    setBusy(true);
    try {
      const r = await refundPaymentAction({
        bookingId,
        amount,
        method,
        reason,
        idempotencyKey: idemKey,
      });
      if (r.ok) {
        toast.success("Refund recorded");
        onOpenChange(false);
        reset();
        onDone();
      } else {
        toast.error(r.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record refund</DialogTitle>
          <DialogDescription>
            Up to {formatPKR(collectedHint)} collected can be refunded. This adds a
            negative payment row; the original is left unchanged.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">
                Amount (PKR) <span className="text-destructive">*</span>
              </label>
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={toPKR(collectedHint)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">Method</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                className={selectCls}
              >
                {ALL_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {METHOD_LABEL[m]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none">
              Reason <span className="text-destructive">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className={textareaCls}
              placeholder="Why is this refund being issued?"
            />
          </div>
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={submit}
            disabled={busy}
          >
            {busy ? "Refunding…" : "Record Refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Void dialog ──────────────────────────────────────────────────────────────

function VoidDialog({
  open,
  onOpenChange,
  paymentId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  paymentId: string;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }
    setBusy(true);
    try {
      const r = await voidPaymentAction(paymentId, { voidReason: reason });
      if (r.ok) {
        toast.success("Payment voided");
        onOpenChange(false);
        setReason("");
        onDone();
      } else {
        toast.error(r.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setReason("");
          setError(null);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void this payment?</DialogTitle>
          <DialogDescription>
            Voiding excludes the row from the collected total. Use this only to
            correct a mistaken entry — for genuine returns, record a refund.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none">
            Reason <span className="text-destructive">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className={textareaCls}
            placeholder="Why is this entry being voided?"
          />
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Keep
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={submit}
            disabled={busy}
          >
            {busy ? "Voiding…" : "Void Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
