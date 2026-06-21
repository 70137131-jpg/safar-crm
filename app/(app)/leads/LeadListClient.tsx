"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import {
  Eye,
  Pencil,
  Trash2,
  MoreHorizontal,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { LeadStatus } from "@prisma/client";
import { formatPKR } from "@/lib/money/paisa";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { StatusBadge } from "@/components/common/StatusBadge";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { TableSkeleton } from "@/components/common/LoadingSkeleton";
import { listLeadsAction, deleteLeadAction } from "@/modules/leads/leads.actions";
import type { LeadListItem } from "@/modules/leads/leads.types";
import { listAssignableAgentsAction } from "@/modules/users/users.actions";
import type { AssignableAgent } from "@/modules/users/users.types";
import { LeadCard } from "./LeadCard";
import { useLeadMutations, LostReasonDialog, ConvertDialog } from "./leadActions";
import { LEAD_STATUS_META, LEAD_STATUS_ORDER, formatLeadDate } from "./leadMeta";
import { useUrlState } from "./useUrlFilters";

const PAGE_SIZE = 50;

type SortKey = "createdAt" | "travelDate" | "budgetPaisa";
const SORT_KEYS: readonly SortKey[] = ["createdAt", "travelDate", "budgetPaisa"];

const selectCls =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function RowMenu({
  lead,
  onDelete,
}: {
  lead: LeadListItem;
  onDelete: (lead: LeadListItem) => void;
}) {
  return (
    <div className="relative text-right">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[160px]">
          <DropdownMenuItem asChild>
            <Link href={`/leads/${lead.id}` as Route} className="flex items-center">
              <Eye className="mr-2 h-4 w-4" /> View
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/leads/${lead.id}/edit` as Route} className="flex items-center">
              <Pencil className="mr-2 h-4 w-4" /> Edit
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <ConfirmDialog
            title="Delete lead?"
            description="This lead will be moved to trash."
            confirmLabel="Delete"
            destructive
            onConfirm={() => onDelete(lead)}
            trigger={(openDialog) => (
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  openDialog();
                }}
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            )}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Sortable column header — click to sort, click again to flip direction. */
function SortHeader({
  label,
  col,
  active,
  dir,
  onSort,
}: {
  label: string;
  col: SortKey;
  active: boolean;
  dir: "asc" | "desc";
  onSort: (col: SortKey) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider hover:text-foreground"
    >
      {label}
      {active ? (
        dir === "asc" ? (
          <ArrowUp className="h-3.5 w-3.5" />
        ) : (
          <ArrowDown className="h-3.5 w-3.5" />
        )
      ) : (
        <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
      )}
    </button>
  );
}

export function LeadListClient({
  search,
  canFilterByAgent,
}: {
  search: string;
  canFilterByAgent: boolean;
}) {
  const { params, set } = useUrlState();

  // ── Filters / sort / page from the URL ──────────────────────────────────
  const stage = (params.get("stage") as LeadStatus | null) ?? "";
  const agent = params.get("agent") ?? "";
  const urlSource = params.get("source") ?? "";
  const sortBy: SortKey = SORT_KEYS.includes(params.get("sort") as SortKey)
    ? (params.get("sort") as SortKey)
    : "createdAt";
  const sortOrder: "asc" | "desc" = params.get("dir") === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);

  // Source has a debounced local mirror so typing stays smooth.
  const [sourceInput, setSourceInput] = useState(urlSource);
  useEffect(() => {
    const t = setTimeout(() => {
      if (sourceInput !== urlSource) set({ source: sourceInput || undefined, page: undefined });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceInput]);

  const [data, setData] = useState<LeadListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<AssignableAgent[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [lostTarget, setLostTarget] = useState<LeadListItem | null>(null);
  const [convertTarget, setConvertTarget] = useState<LeadListItem | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchData = useCallback(async () => {
    setLoading(true);
    const result = await listLeadsAction({
      page,
      pageSize: PAGE_SIZE,
      sortBy,
      sortOrder,
      search: search || undefined,
      status: stage || undefined,
      source: urlSource || undefined,
      assignedAgentId: agent || undefined,
    });
    if (result.ok) {
      setData(result.data.items);
      setTotal(result.data.total);
      setSelected(new Set()); // never carry a selection across a data change
    } else {
      toast.error(result.message);
    }
    setLoading(false);
  }, [page, sortBy, sortOrder, search, stage, urlSource, agent]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Reset to page 1 when the shared search term changes.
  const prevSearch = useRef(search);
  useEffect(() => {
    if (prevSearch.current !== search) {
      prevSearch.current = search;
      if (page !== 1) set({ page: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Load the agent roster once for the filter (ADMIN/MANAGER only).
  useEffect(() => {
    if (!canFilterByAgent) return;
    void listAssignableAgentsAction().then((r) => {
      if (r.ok) setAgents(r.data);
    });
  }, [canFilterByAgent]);

  const mut = useLeadMutations(fetchData);

  function onSort(col: SortKey) {
    if (sortBy === col) set({ dir: sortOrder === "asc" ? "desc" : "asc" });
    else set({ sort: col, dir: "desc", page: undefined });
  }

  const allSelected = data.length > 0 && data.every((l) => selected.has(l.id));
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(data.map((l) => l.id)));
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkDelete() {
    setBulkBusy(true);
    const ids = [...selected];
    const results = await Promise.all(ids.map((id) => deleteLeadAction(id)));
    const failed = results.filter((r) => !r.ok).length;
    setBulkBusy(false);
    if (failed === 0) toast.success(`Deleted ${ids.length} lead${ids.length === 1 ? "" : "s"}`);
    else toast.error(`${ids.length - failed} deleted, ${failed} failed`);
    void fetchData();
  }

  const hasFilters = Boolean(stage || urlSource || agent);
  const activeFilterCount = useMemo(
    () => [stage, urlSource, agent].filter(Boolean).length,
    [stage, urlSource, agent],
  );

  return (
    <>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Filter by stage"
          className={selectCls}
          value={stage}
          onChange={(e) => set({ stage: e.target.value || undefined, page: undefined })}
        >
          <option value="">All stages</option>
          {LEAD_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {LEAD_STATUS_META[s].label}
            </option>
          ))}
        </select>

        <input
          aria-label="Filter by source"
          className={selectCls + " w-40"}
          placeholder="Source…"
          value={sourceInput}
          onChange={(e) => setSourceInput(e.target.value)}
        />

        {canFilterByAgent && (
          <select
            aria-label="Filter by agent"
            className={selectCls}
            value={agent}
            onChange={(e) => set({ agent: e.target.value || undefined, page: undefined })}
          >
            <option value="">All agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={() => {
              setSourceInput("");
              set({ stage: undefined, source: undefined, agent: undefined, page: undefined });
            }}
          >
            <X className="mr-1 h-4 w-4" /> Clear ({activeFilterCount})
          </Button>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
          <span className="text-sm">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <ConfirmDialog
              title={`Delete ${selected.size} lead${selected.size === 1 ? "" : "s"}?`}
              description="The selected leads will be moved to trash."
              confirmLabel="Delete"
              destructive
              onConfirm={bulkDelete}
              trigger={(open) => (
                <Button variant="destructive" size="sm" disabled={bulkBusy} onClick={open}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  {bulkBusy ? "Deleting…" : "Delete selected"}
                </Button>
              )}
            />
          </div>
        </div>
      )}

      <div className="mt-3">
        {loading ? (
          <TableSkeleton columns={7} rows={6} />
        ) : data.length === 0 ? (
          <EmptyState
            title="No leads found"
            description={
              search || hasFilters
                ? "Try different filters or a different search term."
                : "Add your first lead to get started."
            }
            action={
              !search && !hasFilters ? (
                <Button asChild>
                  <Link href="/leads/new">Add Lead</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-hidden rounded-md border md:block">
              <Table containerClassName="max-h-[calc(100vh-18rem)]">
                <TableHeader className="sticky top-0 z-10 bg-muted">
                  <TableRow>
                    <TableHead className="h-10 w-[40px]">
                      <input
                        type="checkbox"
                        aria-label="Select all on this page"
                        className="h-4 w-4 rounded border-input"
                        checked={allSelected}
                        onChange={toggleAll}
                      />
                    </TableHead>
                    <TableHead className="h-10 text-xs font-medium uppercase tracking-wider">
                      Contact
                    </TableHead>
                    <TableHead className="h-10 text-xs font-medium uppercase tracking-wider">
                      Destination
                    </TableHead>
                    <TableHead className="h-10">
                      <SortHeader label="Budget" col="budgetPaisa" active={sortBy === "budgetPaisa"} dir={sortOrder} onSort={onSort} />
                    </TableHead>
                    <TableHead className="h-10">
                      <SortHeader label="Travel Date" col="travelDate" active={sortBy === "travelDate"} dir={sortOrder} onSort={onSort} />
                    </TableHead>
                    <TableHead className="h-10">
                      <SortHeader label="Created" col="createdAt" active={sortBy === "createdAt"} dir={sortOrder} onSort={onSort} />
                    </TableHead>
                    <TableHead className="h-10 text-xs font-medium uppercase tracking-wider">
                      Agent
                    </TableHead>
                    <TableHead className="h-10 text-xs font-medium uppercase tracking-wider">
                      Status
                    </TableHead>
                    <TableHead className="h-10 w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((lead) => {
                    const meta = LEAD_STATUS_META[lead.status];
                    const locked = lead.status === "BOOKED" || lead.status === "TRAVELLED";
                    return (
                      <TableRow key={lead.id} data-state={selected.has(lead.id) ? "selected" : undefined}>
                        <TableCell className="py-3">
                          <input
                            type="checkbox"
                            aria-label={`Select ${lead.contactName}`}
                            className="h-4 w-4 rounded border-input"
                            checked={selected.has(lead.id)}
                            onChange={() => toggleOne(lead.id)}
                          />
                        </TableCell>
                        <TableCell className="py-3">
                          <Link
                            href={`/leads/${lead.id}` as Route}
                            className="font-medium text-foreground hover:underline"
                          >
                            {lead.contactName}
                          </Link>
                          <div className="text-xs text-muted-foreground">{lead.contactPhone}</div>
                        </TableCell>
                        <TableCell className="py-3 text-muted-foreground">
                          {lead.destination ?? "—"}
                        </TableCell>
                        <TableCell className="py-3 text-muted-foreground">
                          {lead.budgetPaisa != null ? formatPKR(lead.budgetPaisa) : "—"}
                        </TableCell>
                        <TableCell className="py-3 text-muted-foreground">
                          {formatLeadDate(lead.travelDate)}
                        </TableCell>
                        <TableCell className="py-3 text-muted-foreground">
                          {formatLeadDate(lead.createdAt)}
                        </TableCell>
                        <TableCell className="py-3 text-muted-foreground">
                          {lead.assignedAgent?.name ?? "Unassigned"}
                        </TableCell>
                        <TableCell className="py-3">
                          {locked ? (
                            <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                          ) : (
                            <select
                              aria-label="Change status"
                              className="h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              value={lead.status}
                              onChange={(e) => {
                                const target = e.target.value as LeadStatus;
                                if (target === lead.status) return;
                                if (target === "BOOKED") setConvertTarget(lead);
                                else if (target === "LOST") setLostTarget(lead);
                                else mut.changeStatus(lead, target);
                              }}
                            >
                              {LEAD_STATUS_ORDER.map((s) => (
                                <option key={s} value={s}>
                                  {LEAD_STATUS_META[s].label}
                                </option>
                              ))}
                            </select>
                          )}
                        </TableCell>
                        <TableCell className="py-3">
                          <RowMenu lead={lead} onDelete={(l) => mut.remove(l)} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className="space-y-3 md:hidden">
              {data.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  mut={mut}
                  onRequestLost={setLostTarget}
                  onRequestConvert={setConvertTarget}
                />
              ))}
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
