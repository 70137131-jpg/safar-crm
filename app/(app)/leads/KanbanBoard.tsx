"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { LeadStatus } from "@prisma/client";
import { cn } from "@/lib/cn";
import { formatPKR } from "@/lib/money/paisa";
import { ERROR_CODES } from "@/lib/errors/codes";
import { getKanbanAction, changeLeadStatusAction } from "@/modules/leads/leads.actions";
import type { KanbanColumns, LeadListItem } from "@/modules/leads/leads.types";
import { LeadCard } from "./LeadCard";
import { useLeadMutations, LostReasonDialog, ConvertDialog } from "./leadActions";
import { LEAD_STATUS_META, LEAD_STATUS_ORDER } from "./leadMeta";

const toneDot: Record<string, string> = {
  neutral: "bg-secondary-foreground/40",
  info: "bg-blue-500",
  success: "bg-green-500",
  warning: "bg-yellow-500",
  danger: "bg-red-500",
};

function emptyColumns(): KanbanColumns {
  return Object.fromEntries(
    LEAD_STATUS_ORDER.map((s) => [s, [] as LeadListItem[]]),
  ) as KanbanColumns;
}

/** Sum of a column's budgets (paisa). Money stays bigint end-to-end. */
function columnTotal(items: LeadListItem[]): bigint {
  return items.reduce((sum, l) => sum + (l.budgetPaisa ?? 0n), 0n);
}

export function KanbanBoard({ search }: { search: string }) {
  const [columns, setColumns] = useState<KanbanColumns>(emptyColumns);
  const [loading, setLoading] = useState(true);
  const [lostTarget, setLostTarget] = useState<LeadListItem | null>(null);
  const [convertTarget, setConvertTarget] = useState<LeadListItem | null>(null);
  const dragged = useRef<LeadListItem | null>(null);
  const [dragOver, setDragOver] = useState<LeadStatus | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const result = await getKanbanAction({ search: search || undefined });
    if (result.ok) setColumns(result.data);
    else toast.error(result.message);
    setLoading(false);
  }, [search]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const mut = useLeadMutations(fetchData);

  /**
   * Move a card to another column immediately (optimistic), then persist. On
   * failure roll the board back; on an OCC conflict refetch to resync versions.
   */
  const optimisticMove = useCallback(async (lead: LeadListItem, target: LeadStatus) => {
    let prev: KanbanColumns | null = null;
    setColumns((cur) => {
      prev = cur;
      const next = { ...cur };
      next[lead.status] = next[lead.status].filter((l) => l.id !== lead.id);
      next[target] = [{ ...lead, status: target }, ...next[target]];
      return next;
    });

    const r = await changeLeadStatusAction(lead.id, { status: target, version: lead.version });
    if (r.ok) {
      // Patch the moved card's version so a follow-up move doesn't conflict.
      setColumns((cur) => {
        const next = { ...cur };
        next[target] = next[target].map((l) =>
          l.id === lead.id ? { ...l, version: r.data.version, status: r.data.status } : l,
        );
        return next;
      });
    } else {
      toast.error(r.message);
      if (prev) setColumns(prev); // roll back the optimistic move
      if (r.code === ERROR_CODES.CONFLICT) void fetchData();
    }
  }, [fetchData]);

  function routeStatus(lead: LeadListItem, target: LeadStatus) {
    if (target === lead.status) return;
    if (target === "BOOKED") setConvertTarget(lead);
    else if (target === "LOST") setLostTarget(lead);
    else void optimisticMove(lead, target);
  }

  function handleDrop(target: LeadStatus) {
    const lead = dragged.current;
    dragged.current = null;
    setDragOver(null);
    if (lead) routeStatus(lead, target);
  }

  return (
    <>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
        {LEAD_STATUS_ORDER.map((status) => {
          const meta = LEAD_STATUS_META[status];
          const items = columns[status] ?? [];
          const total = columnTotal(items);
          return (
            <div
              key={status}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(status);
              }}
              onDragLeave={() => setDragOver((s) => (s === status ? null : s))}
              onDrop={() => handleDrop(status)}
              className={cn(
                "flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30 transition-colors",
                dragOver === status && "ring-2 ring-primary",
              )}
            >
              <div className="border-b px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span className={cn("h-2 w-2 rounded-full", toneDot[meta.tone])} />
                    {meta.label}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {items.length}
                  </span>
                </div>
                {total > 0n && (
                  <p className="mt-1 text-xs text-muted-foreground">{formatPKR(total)}</p>
                )}
              </div>
              <div className="flex-1 space-y-2 p-2">
                {loading ? (
                  Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
                  ))
                ) : items.length === 0 ? (
                  <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                    No leads
                  </p>
                ) : (
                  items.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      mut={mut}
                      onRequestLost={setLostTarget}
                      onRequestConvert={setConvertTarget}
                      onDragStart={(_, l) => {
                        dragged.current = l;
                      }}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      <LostReasonDialog
        lead={lostTarget}
        onClose={() => setLostTarget(null)}
        onConfirm={(reason, notes) => {
          if (lostTarget) mut.markLost(lostTarget, reason, notes);
          setLostTarget(null);
        }}
      />
      <ConvertDialog
        lead={convertTarget}
        onClose={() => setConvertTarget(null)}
        onConfirm={(price) => {
          if (convertTarget) mut.convert(convertTarget, price);
          setConvertTarget(null);
        }}
      />
    </>
  );
}
