"use client";

import { useEffect, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatPKR } from "@/lib/money/paisa";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { listQuotationsAction } from "@/modules/quotations/quotations.actions";
import type { QuotationListItem } from "@/modules/quotations/quotations.types";
import {
  QUOTATION_STATUS_META,
  formatQuotationDate,
} from "../../quotations/quotationMeta";

/** Quotations for a single customer, shown on the customer detail page. */
export function CustomerQuotationsTab({
  customerId,
  canCreate,
}: {
  customerId: string;
  canCreate: boolean;
}) {
  const [items, setItems] = useState<QuotationListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      const r = await listQuotationsAction({
        customerId,
        pageSize: 50,
        sortBy: "createdAt",
        sortOrder: "desc",
      });
      if (!active) return;
      if (r.ok) setItems(r.data.items);
      else toast.error(r.message);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [customerId]);

  const newHref = `/quotations/new?customerId=${customerId}` as Route;

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="h-8 w-8" />}
        title="No quotations yet"
        description="Quotations for this customer will appear here."
        action={
          canCreate ? (
            <Button asChild>
              <Link href={newHref}>New Quotation</Link>
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {canCreate && (
        <div className="flex justify-end">
          <Button asChild size="sm" variant="outline">
            <Link href={newHref}>
              <Plus className="mr-2 h-4 w-4" />
              New Quotation
            </Link>
          </Button>
        </div>
      )}
      <ul className="space-y-2">
        {items.map((q) => {
          const meta = QUOTATION_STATUS_META[q.status];
          return (
            <li key={q.id}>
              <Link
                href={`/quotations/${q.id}` as Route}
                className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 hover:bg-accent/50"
              >
                <div className="min-w-0">
                  <p className="font-medium">{q.quoteNumber ?? "Draft"}</p>
                  <p className="text-xs text-muted-foreground">
                    Valid till: {formatQuotationDate(q.validTill)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm tabular-nums">
                    {formatPKR(q.totalPaisa)}
                  </span>
                  <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
