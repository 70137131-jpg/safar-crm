"use client";

import { useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { toPKR } from "@/lib/money/paisa";
import {
  createQuotationAction,
  updateQuotationAction,
} from "@/modules/quotations/quotations.actions";
import type { QuotationDTO } from "@/modules/quotations/quotations.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUnsavedChangesWarning } from "@/lib/hooks/use-unsaved-changes";
import { CustomerCombobox, type PickedCustomer } from "../bookings/CustomerCombobox";
import { toDateInputValue } from "./quotationMeta";

interface ItemRow {
  description: string;
  quantity: string;
  unitPrice: string;
}

export interface InitialTarget {
  kind: "customer" | "lead";
  id: string;
  name: string;
}

const textareaCls =
  "flex min-h-[70px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function emptyRow(): ItemRow {
  return { description: "", quantity: "1", unitPrice: "" };
}

/** Preview only — authoritative totals (incl. tax) are computed server-side. */
function previewSubtotal(items: ItemRow[]): number {
  return items.reduce((acc, it) => {
    const qty = Number(it.quantity);
    const price = Number(it.unitPrice);
    if (!Number.isFinite(qty) || !Number.isFinite(price)) return acc;
    return acc + qty * price;
  }, 0);
}

export function QuotationForm({
  mode,
  quotation,
  initialTarget,
}: {
  mode: "create" | "edit";
  quotation?: QuotationDTO;
  initialTarget?: InitialTarget | null;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolve the existing target for edit mode.
  const existingTarget: InitialTarget | null =
    mode === "edit" && quotation
      ? quotation.customer
        ? { kind: "customer", id: quotation.customer.id, name: quotation.customer.name }
        : quotation.lead
          ? { kind: "lead", id: quotation.lead.id, name: quotation.lead.name }
          : null
      : (initialTarget ?? null);

  // A lead target (or any target in edit mode) is fixed; a customer target in
  // create mode stays editable through the combobox.
  const lockedTarget =
    mode === "edit" || existingTarget?.kind === "lead" ? existingTarget : null;

  const [customer, setCustomer] = useState<PickedCustomer | null>(
    !lockedTarget && existingTarget?.kind === "customer"
      ? { id: existingTarget.id, name: existingTarget.name }
      : null,
  );

  const [items, setItems] = useState<ItemRow[]>(
    mode === "edit" && quotation && quotation.items.length > 0
      ? quotation.items.map((it) => ({
          description: it.description,
          quantity: String(it.quantity),
          unitPrice: toPKR(it.unitPricePaisa),
        }))
      : [emptyRow()],
  );
  const [validTill, setValidTill] = useState(
    toDateInputValue(quotation?.validTill),
  );
  const [discount, setDiscount] = useState(
    quotation?.discountPaisa != null && quotation.discountPaisa > 0n
      ? toPKR(quotation.discountPaisa)
      : "",
  );
  const [notes, setNotes] = useState(quotation?.notes ?? "");

  useUnsavedChangesWarning(!submitting);

  function updateItem(idx: number, patch: Partial<ItemRow>) {
    setItems((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function addItem() {
    setItems((rows) => [...rows, emptyRow()]);
  }
  function removeItem(idx: number) {
    setItems((rows) => (rows.length === 1 ? rows : rows.filter((_, i) => i !== idx)));
  }

  const subtotalPreview = previewSubtotal(items);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const targetCustomerId = lockedTarget?.kind === "customer" ? lockedTarget.id : customer?.id;
    const targetLeadId = lockedTarget?.kind === "lead" ? lockedTarget.id : undefined;
    if (!targetCustomerId && !targetLeadId) {
      setError("Select a customer for this quotation.");
      return;
    }
    const cleaned = items.filter((it) => it.description.trim() && it.unitPrice.trim());
    if (cleaned.length === 0) {
      setError("Add at least one line item with a description and unit price.");
      return;
    }

    const payload = {
      customerId: targetCustomerId ?? "",
      leadId: targetLeadId ?? "",
      validTill,
      discount,
      notes,
      items: cleaned.map((it) => ({
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
      })),
    };

    setSubmitting(true);
    try {
      const result =
        mode === "create"
          ? await createQuotationAction(payload)
          : await updateQuotationAction(quotation!.id, {
              ...payload,
              version: quotation!.version,
            });
      if (result.ok) {
        toast.success(mode === "create" ? "Quotation created" : "Quotation updated");
        router.push(`/quotations/${result.data.id}` as Route);
        router.refresh();
      } else {
        toast.error(result.message);
        setError(result.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Target */}
      <div className="space-y-2">
        <label className="text-sm font-medium leading-none">
          {lockedTarget?.kind === "lead" ? "Lead" : "Customer"}{" "}
          <span className="text-destructive">*</span>
        </label>
        {lockedTarget ? (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-medium">
            {lockedTarget.name}
          </div>
        ) : (
          <CustomerCombobox value={customer} onChange={setCustomer} />
        )}
        {mode === "edit" && (
          <p className="text-xs text-muted-foreground">
            The recipient can&apos;t be changed after creation.
          </p>
        )}
      </div>

      {/* Line items */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium leading-none">Line items</label>
          <Button type="button" size="sm" variant="outline" onClick={addItem}>
            <Plus className="mr-2 h-4 w-4" />
            Add item
          </Button>
        </div>

        <div className="space-y-2">
          {/* Column labels (desktop) */}
          <div className="hidden gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[1fr_5rem_8rem_2rem]">
            <span>Description</span>
            <span>Qty</span>
            <span>Unit price (PKR)</span>
            <span className="sr-only">Remove</span>
          </div>
          {items.map((row, idx) => (
            <div
              key={idx}
              className="grid gap-2 sm:grid-cols-[1fr_5rem_8rem_2rem] sm:items-center"
            >
              <Input
                value={row.description}
                onChange={(e) => updateItem(idx, { description: e.target.value })}
                placeholder="e.g. Umrah package — 4 nights"
              />
              <Input
                inputMode="numeric"
                value={row.quantity}
                onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                placeholder="1"
                aria-label="Quantity"
              />
              <Input
                inputMode="decimal"
                value={row.unitPrice}
                onChange={(e) => updateItem(idx, { unitPrice: e.target.value })}
                placeholder="0"
                aria-label="Unit price"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 justify-self-start text-muted-foreground hover:text-destructive"
                onClick={() => removeItem(idx)}
                disabled={items.length === 1}
                aria-label="Remove item"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <p className="text-right text-sm text-muted-foreground">
          Subtotal (preview):{" "}
          <span className="font-medium text-foreground tabular-nums">
            Rs {subtotalPreview.toLocaleString("en-PK", { maximumFractionDigits: 2 })}
          </span>
          <span className="ml-1 text-xs">
            — discount &amp; agency tax applied on save
          </span>
        </p>
      </div>

      {/* Meta */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none">Valid till</label>
          <Input
            type="date"
            value={validTill}
            min={new Date().toISOString().split("T")[0]}
            onChange={(e) => setValidTill(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none">Discount (PKR)</label>
          <Input
            inputMode="decimal"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            placeholder="0"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium leading-none">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className={textareaCls}
          placeholder="Terms, inclusions, or anything the customer should see…"
        />
      </div>

      {error && <p className="text-sm font-medium text-destructive">{error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={submitting}>
          {submitting
            ? "Saving…"
            : mode === "create"
              ? "Create Quotation"
              : "Save Changes"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
