"use client";

import { useCallback, useEffect, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import type { BookingStatus } from "@prisma/client";
import {
  Eye,
  Pencil,
  MoreHorizontal,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { formatPKR } from "@/lib/money/paisa";
import { SearchInput } from "@/components/common/SearchInput";
import { EmptyState } from "@/components/common/EmptyState";
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
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TableSkeleton } from "@/components/common/LoadingSkeleton";
import { listBookingsAction } from "@/modules/bookings/bookings.actions";
import type { BookingListItem } from "@/modules/bookings/bookings.types";
import {
  BOOKING_STATUS_META,
  BOOKING_STATUS_ORDER,
  formatBookingDate,
} from "./bookingMeta";

// ─── Columns ──────────────────────────────────────────────────────────────────

const columns: ColumnDef<BookingListItem>[] = [
  {
    accessorKey: "bookingNumber",
    header: "Booking #",
    cell: ({ row }) => (
      <Link
        href={`/bookings/${row.original.id}` as Route}
        className="font-medium text-foreground hover:underline"
      >
        {row.original.bookingNumber}
      </Link>
    ),
  },
  {
    id: "customer",
    header: "Customer",
    cell: ({ row }) => (
      <span className="text-sm">{row.original.customer?.name ?? "—"}</span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const meta = BOOKING_STATUS_META[row.original.status];
      return <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>;
    },
  },
  {
    accessorKey: "travelDate",
    header: "Travel Date",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {formatBookingDate(row.original.travelDate)}
      </span>
    ),
  },
  {
    accessorKey: "totalPricePaisa",
    header: "Total",
    cell: ({ row }) => (
      <span className="text-sm tabular-nums">
        {formatPKR(row.original.totalPricePaisa)}
      </span>
    ),
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {formatBookingDate(row.original.createdAt)}
      </span>
    ),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => <RowActions item={row.original} />,
  },
];

const SORTABLE = new Set([
  "bookingNumber",
  "status",
  "travelDate",
  "totalPricePaisa",
  "createdAt",
]);

function RowActions({ item }: { item: BookingListItem }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[160px]">
        <DropdownMenuItem asChild>
          <Link href={`/bookings/${item.id}` as Route} className="flex items-center">
            <Eye className="mr-2 h-4 w-4" /> View
          </Link>
        </DropdownMenuItem>
        {item.status !== "CANCELLED" && (
          <DropdownMenuItem asChild>
            <Link
              href={`/bookings/${item.id}/edit` as Route}
              className="flex items-center"
            >
              <Pencil className="mr-2 h-4 w-4" /> Edit
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Mobile card ──────────────────────────────────────────────────────────────

function BookingCard({ item }: { item: BookingListItem }) {
  const meta = BOOKING_STATUS_META[item.status];
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Link
              href={`/bookings/${item.id}` as Route}
              className="font-medium hover:underline"
            >
              {item.bookingNumber}
            </Link>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {item.customer?.name ?? "—"}
            </p>
          </div>
          <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="tabular-nums text-foreground">
            {formatPKR(item.totalPricePaisa)}
          </span>
          <span>Travel: {formatBookingDate(item.travelDate)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-2 pt-4">
      <p className="text-sm text-muted-foreground">
        Page {page} of {totalPages}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function BookingListClient() {
  const [data, setData] = useState<BookingListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<BookingStatus | "">("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);

  const totalPages = Math.ceil(total / pageSize);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const result = await listBookingsAction({
      page,
      pageSize,
      sortBy,
      sortOrder,
      search: search || undefined,
      status: status || undefined,
    });
    if (result.ok) {
      setData(result.data.items);
      setTotal(result.data.total);
    } else {
      toast.error(result.message);
    }
    setLoading(false);
  }, [page, pageSize, sortBy, sortOrder, search, status]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleSort = useCallback(
    (column: string) => {
      if (!SORTABLE.has(column)) return;
      if (sortBy === column) {
        setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
      } else {
        setSortBy(column);
        setSortOrder("asc");
      }
      setPage(1);
    },
    [sortBy],
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="w-full max-w-sm">
          <SearchInput
            placeholder="Search by booking # or customer…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as BookingStatus | "");
            setPage(1);
          }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {BOOKING_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {BOOKING_STATUS_META[s].label}
            </option>
          ))}
        </select>
      </div>

      {loading && <TableSkeleton columns={6} rows={6} />}

      {!loading && data.length === 0 && (
        <EmptyState
          title="No bookings found"
          description={
            search || status
              ? "Try a different search or filter."
              : "Create your first booking to get started."
          }
          action={
            !search && !status ? (
              <Button asChild>
                <Link href="/bookings/new">New Booking</Link>
              </Button>
            ) : undefined
          }
        />
      )}

      {!loading && data.length > 0 && (
        <>
          <div className="hidden overflow-hidden rounded-md border md:block">
            <Table containerClassName="max-h-[calc(100vh-16rem)]">
              <TableHeader className="sticky top-0 z-10 bg-muted">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      const isSortable = SORTABLE.has(header.column.id);
                      return (
                        <TableHead
                          key={header.id}
                          className={cn(
                            "h-10 text-xs font-medium uppercase tracking-wider",
                            isSortable && "cursor-pointer hover:text-foreground",
                          )}
                          onClick={() => handleSort(header.column.id)}
                        >
                          <div className="flex items-center gap-1">
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                            {isSortable && (
                              <span className="flex items-center">
                                {sortBy === header.column.id ? (
                                  sortOrder === "asc" ? (
                                    <ArrowUp className="ml-1 h-3 w-3" />
                                  ) : (
                                    <ArrowDown className="ml-1 h-3 w-3" />
                                  )
                                ) : (
                                  <ArrowUpDown className="ml-1 h-3 w-3 text-muted-foreground/30" />
                                )}
                              </span>
                            )}
                          </div>
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="py-3">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 md:hidden">
            {data.map((item) => (
              <BookingCard key={item.id} item={item} />
            ))}
          </div>

          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
