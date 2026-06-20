"use client";

import { useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Pencil,
  Send,
  CheckCircle2,
  Download,
  FileText,
  CalendarDays,
  User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";
import { formatPKR } from "@/lib/money/paisa";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import {
  sendQuotationAction,
  acceptQuotationAction,
  getQuotationAction,
} from "@/modules/quotations/quotations.actions";
import type { QuotationDTO } from "@/modules/quotations/quotations.types";
import {
  QUOTATION_STATUS_META,
  formatQuotationDate,
  formatQuotationDateTime,
} from "../quotationMeta";

export function QuotationDetailClient({
  quotation: initial,
  caps,
}: {
  quotation: QuotationDTO;
  caps: { canEdit: boolean; canSend: boolean };
}) {
  const router = useRouter();
  const [quotation, setQuotation] = useState<QuotationDTO>(initial);

  const meta = QUOTATION_STATUS_META[quotation.status];
  const target = quotation.customer ?? quotation.lead;
  const targetHref: Route | null = quotation.customer
    ? (`/customers/${quotation.customer.id}` as Route)
    : quotation.lead
      ? (`/leads/${quotation.lead.id}` as Route)
      : null;

  const isDraft = quotation.status === "DRAFT";
  const isSent = quotation.status === "SENT";
  const hasPdf = !!quotation.pdfFileKey;

  async function handleSend() {
    const r = await sendQuotationAction(quotation.id, { version: quotation.version });
    if (r.ok) {
      setQuotation(r.data);
      toast.success(`Quotation ${r.data.quoteNumber ?? ""} sent`);
      router.refresh();
    } else {
      toast.error(r.message);
      if (r.code === "CONFLICT") {
        const fresh = await getQuotationAction(quotation.id);
        if (fresh.ok) setQuotation(fresh.data);
      }
    }
  }

  async function handleAccept() {
    const r = await acceptQuotationAction(quotation.id, {
      version: quotation.version,
    });
    if (r.ok) {
      setQuotation(r.data);
      toast.success("Quotation marked accepted");
      router.refresh();
    } else {
      toast.error(r.message);
      if (r.code === "CONFLICT") {
        const fresh = await getQuotationAction(quotation.id);
        if (fresh.ok) setQuotation(fresh.data);
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <FileText className="h-7 w-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">
                  {quotation.quoteNumber ?? "Draft quotation"}
                </h2>
                <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {target ? (
                  targetHref ? (
                    <Link href={targetHref} className="hover:underline">
                      {target.name}
                    </Link>
                  ) : (
                    target.name
                  )
                ) : (
                  "—"
                )}
                {quotation.lead && !quotation.customer && " (lead)"}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {hasPdf && (
              <a
                href={`/api/quotations/${quotation.id}/pdf`}
                className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-accent"
              >
                <Download className="h-4 w-4" />
                PDF
              </a>
            )}
            {isDraft && caps.canEdit && (
              <Link
                href={`/quotations/${quotation.id}/edit` as Route}
                className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-accent"
              >
                <Pencil className="h-4 w-4" />
                Edit
              </Link>
            )}
            {isDraft && caps.canSend && (
              <ConfirmDialog
                title="Send this quotation?"
                description="A quote number is assigned, a PDF is generated, and the customer is emailed a summary. A sent quotation can no longer be edited."
                confirmLabel="Send"
                onConfirm={handleSend}
                trigger={(open) => (
                  <Button onClick={open}>
                    <Send className="mr-2 h-4 w-4" />
                    Send
                  </Button>
                )}
              />
            )}
            {isSent && caps.canEdit && (
              <ConfirmDialog
                title="Mark as accepted?"
                description="Record that the customer has accepted this quotation."
                confirmLabel="Mark Accepted"
                onConfirm={handleAccept}
                trigger={(open) => (
                  <Button onClick={open}>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Mark Accepted
                  </Button>
                )}
              />
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            icon={<UserIcon className="h-4 w-4" />}
            label="Recipient"
            value={target?.name}
          />
          <Field
            icon={<CalendarDays className="h-4 w-4" />}
            label="Valid till"
            value={formatQuotationDate(quotation.validTill)}
          />
          <Field label="Total" value={formatPKR(quotation.totalPaisa)} />
        </div>
      </div>

      {/* Items */}
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2 font-medium">Description</th>
              <th className="px-4 py-2 text-right font-medium">Qty</th>
              <th className="px-4 py-2 text-right font-medium">Unit price</th>
              <th className="px-4 py-2 text-right font-medium">Line total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {quotation.items.map((it) => (
              <tr key={it.id}>
                <td className="px-4 py-2.5">{it.description}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{it.quantity}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatPKR(it.unitPricePaisa)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatPKR(it.linePaisa)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="space-y-1 border-t bg-muted/30 px-4 py-3 text-sm">
          <TotalRow label="Subtotal" value={formatPKR(quotation.subtotalPaisa)} />
          {quotation.discountPaisa > 0n && (
            <TotalRow
              label="Discount"
              value={`− ${formatPKR(quotation.discountPaisa)}`}
            />
          )}
          <TotalRow label="Tax" value={formatPKR(quotation.taxPaisa)} />
          <TotalRow label="Total" value={formatPKR(quotation.totalPaisa)} strong />
        </div>
      </div>

      {/* Notes */}
      {quotation.notes && (
        <div className="rounded-lg border bg-card p-4 text-sm">
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">Notes</h3>
          <p className="whitespace-pre-wrap">{quotation.notes}</p>
        </div>
      )}

      {/* Timeline meta */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>Created {formatQuotationDateTime(quotation.createdAt)}</span>
        {quotation.sentAt && <span>Sent {formatQuotationDateTime(quotation.sentAt)}</span>}
        {quotation.acceptedAt && (
          <span>Accepted {formatQuotationDateTime(quotation.acceptedAt)}</span>
        )}
        {quotation.expiredAt && (
          <span>Expired {formatQuotationDateTime(quotation.expiredAt)}</span>
        )}
      </div>
    </div>
  );
}

function Field({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="text-sm">{value || "—"}</p>
    </div>
  );
}

function TotalRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={
        strong
          ? "flex items-center justify-between border-t pt-1 font-semibold"
          : "flex items-center justify-between text-muted-foreground"
      }
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
