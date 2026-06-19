"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { LeadStatus } from "@prisma/client";
import { cn } from "@/lib/cn";
import { getKanbanAction } from "@/modules/leads/leads.actions";
import type { KanbanColumns, LeadListItem } from "@/modules/leads/leads.types";
import { LeadCard } from "./LeadCard";
import {
  useLeadMutations,
  LostReasonDialog,
  ConvertDialog,
} from "./leadActions";
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

  function routeStatus(lead: LeadListItem, target: LeadStatus) {
    if (target === lead.status) return;
    if (target === "BOOKED") setConvertTarget(lead);
    else if (target === "LOST") setLostTarget(lead);
    else mut.changeStatus(lead, target);
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
              <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span className={cn("h-2 w-2 rounded-full", toneDot[meta.tone])} />
                  {meta.label}
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {items.length}
                </span>
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
