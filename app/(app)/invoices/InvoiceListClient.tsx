"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Download, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { listInvoicesAction, markInvoicePaidAction, voidInvoiceAction } from "@/modules/invoices/invoices.actions";
import type { InvoiceListItem } from "@/modules/invoices/invoices.types";
import { formatPKR } from "@/lib/money/paisa";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";

export function InvoiceListClient({ caps }: { caps: { canUpdate: boolean; canVoid: boolean } }) {
  const [items, setItems] = useState<InvoiceListItem[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await listInvoicesAction({ page: 1, pageSize: 100, sortBy: "issuedAt", sortOrder: "desc", status: status || undefined });
    if (result.ok) setItems(result.data.items);
    else toast.error(result.message);
    setLoading(false);
  }, [status]);

  useEffect(() => {
    // Server actions are the module's client data boundary; refresh when the filter changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function markPaid(id: string) {
    const result = await markInvoicePaidAction(id);
    if (!result.ok) return toast.error(result.message);
    toast.success("Invoice marked paid");
    await load();
  }

  async function voidInvoice(id: string) {
    const reason = window.prompt("Reason for voiding this invoice?");
    if (reason === null) return;
    const result = await voidInvoiceAction(id, { reason });
    if (!result.ok) return toast.error(result.message);
    toast.success("Invoice voided");
    await load();
  }

  return (
    <div className="space-y-4">
      <select className="h-9 rounded-md border bg-background px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">All statuses</option><option value="ISSUED">Issued</option><option value="PAID">Paid</option><option value="CANCELLED">Cancelled</option>
      </select>
      {loading ? <div className="h-32 animate-pulse rounded-lg bg-muted" /> : items.length === 0 ? (
        <EmptyState icon={<ReceiptText className="h-8 w-8" />} title="No invoices" description="Invoices can be issued from a booking's Invoices tab." />
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{item.invoiceNumber}</div>
                <div className="text-xs text-muted-foreground">{item.customerName ?? "—"} · <Link className="hover:underline" href={`/bookings/${item.bookingId}` as Route}>{item.bookingNumber ?? "Booking"}</Link></div>
              </div>
              <div className="font-medium tabular-nums">{formatPKR(item.amountPaisa)}</div>
              <StatusBadge tone={item.status === "PAID" ? "success" : item.status === "CANCELLED" ? "danger" : "warning"}>{item.status}</StatusBadge>
              <Button asChild size="sm" variant="outline"><a href={`/api/invoices/${item.id}/pdf`}><Download className="mr-2 h-4 w-4" />PDF</a></Button>
              {item.status === "ISSUED" && caps.canUpdate ? <Button size="sm" onClick={() => markPaid(item.id)}>Mark paid</Button> : null}
              {item.status === "ISSUED" && caps.canVoid ? <Button size="sm" variant="outline" onClick={() => voidInvoice(item.id)}>Void</Button> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
