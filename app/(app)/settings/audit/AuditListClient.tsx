"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";
import { useUrlState } from "@/lib/hooks/use-url-state";
import { EmptyState } from "@/components/common/EmptyState";
import { TableSkeleton } from "@/components/common/LoadingSkeleton";
import { AuditDiff } from "@/components/common/AuditDiff";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  listAuditLogsAction,
  listAuditActorsAction,
} from "@/modules/audit/audit.actions";
import type { AuditActorOption, AuditLogItem } from "@/modules/audit/audit.types";

const PAGE_SIZE = 50;

/** Entities that the app audits — keep aligned with the `withAudit` call sites. */
const ENTITY_OPTIONS = [
  "Customer",
  "Lead",
  "Booking",
  "Payment",
  "Quotation",
  "Invoice",
  "Document",
  "Task",
  "Interaction",
  "User",
  "Settings",
] as const;

const selectCls =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const dtf = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});
function formatWhen(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return isNaN(date.getTime()) ? "—" : dtf.format(date);
}

export function AuditListClient() {
  const { params, set } = useUrlState();

  const entity = params.get("entity") ?? "";
  const action = params.get("action") ?? "";
  const actorId = params.get("actor") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);

  // Local mirror for the debounced action-text filter.
  const [actionInput, setActionInput] = useState(action);
  useEffect(() => {
    const t = setTimeout(() => {
      if (actionInput !== action) set({ action: actionInput || undefined, page: undefined });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionInput]);

  const [data, setData] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actors, setActors] = useState<AuditActorOption[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchData = useCallback(async () => {
    setLoading(true);
    const result = await listAuditLogsAction({
      page,
      pageSize: PAGE_SIZE,
      sortOrder: "desc",
      entity: entity || undefined,
      action: action || undefined,
      actorId: actorId || undefined,
      startDate: from || undefined,
      endDate: to || undefined,
    });
    if (result.ok) {
      setData(result.data.items);
      setTotal(result.data.total);
      setExpanded(new Set());
    } else {
      toast.error(result.message);
    }
    setLoading(false);
  }, [page, entity, action, actorId, from, to]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Load the actor roster once for the filter.
  useEffect(() => {
    void listAuditActorsAction().then((r) => {
      if (r.ok) setActors(r.data);
    });
  }, []);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const hasFilters = Boolean(entity || action || actorId || from || to);

  return (
    <>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Filter by entity"
          className={selectCls}
          value={entity}
          onChange={(e) => set({ entity: e.target.value || undefined, page: undefined })}
        >
          <option value="">All entities</option>
          {ENTITY_OPTIONS.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>

        <input
          aria-label="Filter by action"
          className={selectCls + " w-44"}
          placeholder="Action…"
          value={actionInput}
          onChange={(e) => setActionInput(e.target.value)}
        />

        <select
          aria-label="Filter by actor"
          className={selectCls}
          value={actorId}
          onChange={(e) => set({ actor: e.target.value || undefined, page: undefined })}
        >
          <option value="">All actors</option>
          {actors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>

        <input
          type="date"
          aria-label="From date"
          className={selectCls}
          value={from}
          max={to || undefined}
          onChange={(e) => set({ from: e.target.value || undefined, page: undefined })}
        />
        <input
          type="date"
          aria-label="To date"
          className={selectCls}
          value={to}
          min={from || undefined}
          onChange={(e) => set({ to: e.target.value || undefined, page: undefined })}
        />

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={() => {
              setActionInput("");
              set({
                entity: undefined,
                action: undefined,
                actor: undefined,
                from: undefined,
                to: undefined,
                page: undefined,
              });
            }}
          >
            <X className="mr-1 h-4 w-4" /> Clear
          </Button>
        )}
      </div>

      <div className="mt-3">
        {loading ? (
          <TableSkeleton columns={5} rows={8} />
        ) : data.length === 0 ? (
          <EmptyState
            title="No audit entries"
            description={
              hasFilters
                ? "Try different filters or a wider date range."
                : "Mutations will appear here as they happen."
            }
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-hidden rounded-md border md:block">
              <Table containerClassName="max-h-[calc(100vh-20rem)]">
                <TableHeader className="sticky top-0 z-10 bg-muted">
                  <TableRow>
                    <TableHead className="h-10 w-[40px]" />
                    <TableHead className="h-10 text-xs font-medium uppercase tracking-wider">
                      Time
                    </TableHead>
                    <TableHead className="h-10 text-xs font-medium uppercase tracking-wider">
                      Actor
                    </TableHead>
                    <TableHead className="h-10 text-xs font-medium uppercase tracking-wider">
                      Action
                    </TableHead>
                    <TableHead className="h-10 text-xs font-medium uppercase tracking-wider">
                      Entity
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((row) => {
                    const open = expanded.has(row.id);
                    return (
                      <Fragment key={row.id}>
                        <TableRow
                          className="cursor-pointer"
                          onClick={() => toggle(row.id)}
                          data-state={open ? "selected" : undefined}
                        >
                          <TableCell className="py-3 text-muted-foreground">
                            {open ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </TableCell>
                          <TableCell className="py-3 text-muted-foreground tabular-nums">
                            {formatWhen(row.createdAt)}
                          </TableCell>
                          <TableCell className="py-3">
                            {row.actor ? (
                              <>
                                <div className="font-medium text-foreground">
                                  {row.actor.name}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {row.actor.email}
                                </div>
                              </>
                            ) : (
                              <span className="text-muted-foreground">System</span>
                            )}
                          </TableCell>
                          <TableCell className="py-3 font-mono text-xs">{row.action}</TableCell>
                          <TableCell className="py-3 text-muted-foreground">
                            <span className="text-foreground">{row.entity}</span>
                            <div className="text-xs text-muted-foreground">{row.entityId}</div>
                          </TableCell>
                        </TableRow>
                        {open && (
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableCell colSpan={5} className="p-4">
                              <AuditDiff before={row.before} after={row.after} />
                              {(row.ip || row.userAgent) && (
                                <p className="mt-2 text-xs text-muted-foreground">
                                  {row.ip ? `IP ${row.ip}` : ""}
                                  {row.ip && row.userAgent ? " · " : ""}
                                  {row.userAgent ?? ""}
                                </p>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className="space-y-3 md:hidden">
              {data.map((row) => {
                const open = expanded.has(row.id);
                return (
                  <div key={row.id} className="rounded-lg border bg-card p-3">
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-2 text-left"
                      onClick={() => toggle(row.id)}
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-xs text-foreground">{row.action}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {row.entity} · {row.actor?.name ?? "System"}
                        </div>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          {formatWhen(row.createdAt)}
                        </div>
                      </div>
                      {open ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                    {open && (
                      <div className="mt-3">
                        <AuditDiff before={row.before} after={row.after} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-2 pt-4">
                <p className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => set({ page: page <= 2 ? undefined : String(page - 1) })}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => set({ page: String(page + 1) })}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
