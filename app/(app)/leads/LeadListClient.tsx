"use client";

import { useCallback, useEffect, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { Eye, Pencil, Trash2, MoreHorizontal } from "lucide-react";
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
import { listLeadsAction } from "@/modules/leads/leads.actions";
import type { LeadListItem } from "@/modules/leads/leads.types";
import { LeadCard } from "./LeadCard";
import {
  useLeadMutations,
  LostReasonDialog,
  ConvertDialog,
} from "./leadActions";
import { LEAD_STATUS_META, LEAD_STATUS_ORDER, formatLeadDate } from "./leadMeta";

const PAGE_SIZE = 50;

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

export function LeadListClient({ search }: { search: string }) {
  const [data, setData] = useState<LeadListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [lostTarget, setLostTarget] = useState<LeadListItem | null>(null);
  const [convertTarget, setConvertTarget] = useState<LeadListItem | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchData = useCallback(async () => {
    setLoading(true);
    const result = await listLeadsAction({
      page,
      pageSize: PAGE_SIZE,
      sortBy: "createdAt",
      sortOrder: "desc",
      search: search || undefined,
    });
    if (result.ok) {
      setData(result.data.items);
      setTotal(result.data.total);
    } else {
      toast.error(result.message);
    }
    setLoading(false);
  }, [page, search]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Reset to page 1 whenever the search term changes.
  useEffect(() => {
    setPage(1);
  }, [search]);

  const mut = useLeadMutations(fetchData);

  function routeStatus(lead: LeadListItem, target: LeadStatus) {
    if (target === lead.status) return;
    if (target === "BOOKED") setConvertTarget(lead);
    else if (target === "LOST") setLostTarget(lead);
    else mut.changeStatus(lead, target);
  }

  if (loading) {
    return <TableSkeleton columns={6} rows={6} />;
  }

  if (data.length === 0) {
    return (
      <EmptyState
        title="No leads found"
        description={
          search ? "Try a different search term." : "Add your first lead to get started."
        }
        action={
          !search ? (
            <Button asChild>
              <Link href="/leads/new">Add Lead</Link>
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-md border md:block">
        <Table containerClassName="max-h-[calc(100vh-16rem)]">
          <TableHeader className="sticky top-0 z-10 bg-muted">
            <TableRow>
              <TableHead className="h-10 text-xs font-medium uppercase tracking-wider">Contact</TableHead>
              <TableHead className="h-10 text-xs font-medium uppercase tracking-wider">Destination</TableHead>
              <TableHead className="h-10 text-xs font-medium uppercase tracking-wider">Budget</TableHead>
              <TableHead className="h-10 text-xs font-medium uppercase tracking-wider">Travel Date</TableHead>
              <TableHead className="h-10 text-xs font-medium uppercase tracking-wider">Agent</TableHead>
              <TableHead className="h-10 text-xs font-medium uppercase tracking-wider">Status</TableHead>
              <TableHead className="h-10 w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((lead) => {
              const meta = LEAD_STATUS_META[lead.status];
              const locked = lead.status === "BOOKED" || lead.status === "TRAVELLED";
              return (
                <TableRow key={lead.id}>
                  <TableCell className="py-3">
                    <Link
                      href={`/leads/${lead.id}` as Route}
                      className="font-medium text-foreground hover:underline"
                    >
                      {lead.contactName}
                    </Link>
                    <div className="text-xs text-muted-foreground">{lead.contactPhone}</div>
                  </TableCell>
                  <TableCell className="py-3 text-muted-foreground">{lead.destination ?? "—"}</TableCell>
                  <TableCell className="py-3 text-muted-foreground">
                    {lead.budgetPaisa != null ? formatPKR(lead.budgetPaisa) : "—"}
                  </TableCell>
                  <TableCell className="py-3 text-muted-foreground">
                    {formatLeadDate(lead.travelDate)}
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
                        onChange={(e) => routeStatus(lead, e.target.value as LeadStatus)}
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
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

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
