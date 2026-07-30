"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { createInvoiceAction, listInvoicesAction, markInvoicePaidAction, voidInvoiceAction } from "@/modules/invoices/invoices.actions";
import type { InvoiceListItem } from "@/modules/invoices/invoices.types";
import { formatPKR } from "@/lib/money/paisa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/common/EmptyState";

export interface InvoiceCaps { canView: boolean; canCreate: boolean; canUpdate: boolean; canVoid: boolean }

export function InvoicesPanel({ bookingId, caps }: { bookingId: string; caps: InvoiceCaps }) {
  const [items, setItems] = useState<InvoiceListItem[]>([]);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const result = await listInvoicesAction({ page: 1, pageSize: 100, sortBy: "issuedAt", sortOrder: "desc", bookingId });
    if (result.ok) setItems(result.data.items); else toast.error(result.message);
    setLoading(false);
  }, [bookingId]);
  useEffect(() => {
    // Server actions are the module's client data boundary; refresh when the booking changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function create() {
    const result = await createInvoiceAction({ bookingId, amount, notes });
    if (!result.ok) return toast.error(result.message);
    setAmount(""); setNotes(""); toast.success(`Invoice ${result.data.invoiceNumber} issued`); await load();
  }

  async function transition(id: string, action: "paid" | "void") {
    const result = action === "paid"
      ? await markInvoicePaidAction(id)
      : await voidInvoiceAction(id, { reason: window.prompt("Reason for voiding?") ?? "" });
    if (!result.ok) return toast.error(result.message);
    toast.success(action === "paid" ? "Invoice marked paid" : "Invoice voided"); await load();
  }

  if (!caps.canView) return null;
  return (
    <div className="space-y-5">
      {caps.canCreate ? (
        <div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-[1fr_2fr_auto]">
          <Input aria-label="Invoice amount" placeholder="Amount PKR (booking total if blank)" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Textarea aria-label="Invoice notes" placeholder="Invoice notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <Button onClick={create}>Issue invoice</Button>
        </div>
      ) : null}
      {loading ? <div className="h-24 animate-pulse rounded-lg bg-muted" /> : items.length === 0 ? (
        <EmptyState icon={<ReceiptText className="h-8 w-8" />} title="No invoices" description="Issue the first invoice for this booking." />
      ) : items.map((item) => (
        <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
          <div className="flex-1"><div className="font-medium">{item.invoiceNumber}</div><div className="text-xs text-muted-foreground">{item.status}</div></div>
          <div className="font-medium">{formatPKR(item.amountPaisa)}</div>
          <Button asChild size="sm" variant="outline"><a href={`/api/invoices/${item.id}/pdf`}><Download className="mr-2 h-4 w-4" />PDF</a></Button>
          {item.status === "ISSUED" && caps.canUpdate ? <Button size="sm" onClick={() => transition(item.id, "paid")}>Mark paid</Button> : null}
          {item.status === "ISSUED" && caps.canVoid ? <Button size="sm" variant="outline" onClick={() => transition(item.id, "void")}>Void</Button> : null}
        </div>
      ))}
    </div>
  );
}
