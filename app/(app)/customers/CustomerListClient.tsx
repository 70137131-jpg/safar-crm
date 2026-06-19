"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { Route } from "next";
import Link from "next/link";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  Eye,
  Pencil,
  Trash2,
  MoreHorizontal,
  AlertTriangle,
  Archive,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { SearchInput } from "@/components/common/SearchInput";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
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
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TableSkeleton } from "@/components/common/LoadingSkeleton";
import {
  listCustomersAction,
  deleteCustomerAction,
} from "@/modules/customers/customers.actions";
import type { CustomerListItem } from "@/modules/customers/customers.types";

// ─── Column definitions ────────────────────────────────────────────────────

function formatDate(date: Date | null) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeZone: "Asia/Karachi",
  }).format(new Date(date));
}

function isExpiryWarning(date: Date | null): boolean {
  if (!date) return false;
  const sixMonths = new Date();
  sixMonths.setMonth(sixMonths.getMonth() + 6);
  return new Date(date) <= sixMonths;
}

function columns(
  onDelete: (id: string) => void,
): ColumnDef<CustomerListItem>[] {
  return [
    {
      accessorKey: "name",
      header: "Name",
      enableHiding: false,
      cell: ({ row }) => (
        <Link
          href={`/customers/${row.original.id}` as Route}
          className="font-medium text-foreground hover:underline"
        >
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: "phone",
      header: "Phone",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.phone ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.email ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "nationality",
      header: "Nationality",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.nationality ?? "—"}</span>
      ),
    },
    {
      accessorKey: "assignedAgent",
      header: "Agent",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.assignedAgent?.name ?? "Unassigned"}
        </span>
      ),
    },
    {
      accessorKey: "passportExpiry",
      header: "Passport Expiry",
      cell: ({ row }) => {
        const warning = isExpiryWarning(row.original.passportExpiry);
        return (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-sm",
              warning
                ? "font-medium text-amber-700 dark:text-amber-400"
                : "text-muted-foreground",
            )}
          >
            {warning && <AlertTriangle className="h-3.5 w-3.5" />}
            {formatDate(row.original.passportExpiry)}
          </span>
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(row.original.createdAt)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      enableHiding: false,
      cell: ({ row }) => <RowActions item={row.original} onDelete={onDelete} />,
    },
  ];
}

// ─── Row actions dropdown ──────────────────────────────────────────────────

function RowActions({
  item,
  onDelete,
}: {
  item: CustomerListItem;
  onDelete: (id: string) => void;
}) {
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
          <Link href={`/customers/${item.id}` as Route} className="flex items-center">
            <Eye className="mr-2 h-4 w-4" /> View
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/customers/${item.id}/edit` as Route} className="flex items-center">
            <Pencil className="mr-2 h-4 w-4" /> Edit
          </Link>
        </DropdownMenuItem>
        <ConfirmDialog
          title="Delete customer?"
          description="This customer will be moved to trash. You can restore them later."
          confirmLabel="Delete"
          destructive
          onConfirm={() => onDelete(item.id)}
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
  );
}

// ─── Mobile card ────────────────────────────────────────────────────────────

function CustomerCard({
  item,
  onDelete,
}: {
  item: CustomerListItem;
  onDelete: (id: string) => void;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Link
              href={`/customers/${item.id}` as Route}
              className="font-medium hover:underline"
            >
              {item.name}
            </Link>
            <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
              {item.phone && <p>{item.phone}</p>}
              {item.email && <p className="truncate">{item.email}</p>}
            </div>
          </div>
          <RowActions item={item} onDelete={onDelete} />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {item.nationality && <span>{item.nationality}</span>}
          {item.assignedAgent && <span>{item.assignedAgent.name}</span>}
          {item.passportExpiry && (
            <span
              className={cn(
                "inline-flex items-center gap-1",
                isExpiryWarning(item.passportExpiry) &&
                  "font-medium text-amber-700 dark:text-amber-400",
              )}
            >
              {isExpiryWarning(item.passportExpiry) && (
                <AlertTriangle className="h-3 w-3" />
              )}
              Exp: {formatDate(item.passportExpiry)}
            </span>
          )}
          <span>{formatDate(item.createdAt)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Pagination ─────────────────────────────────────────────────────────────

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

// ─── Main client component ──────────────────────────────────────────────────

export function CustomerListClient() {
  const [, startTransition] = useTransition();
  const [data, setData] = useState<CustomerListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);
  const [columnVisibility, setColumnVisibility] = useState<
    Record<string, boolean>
  >({});

  const totalPages = Math.ceil(total / pageSize);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const result = await listCustomersAction({
      page,
      pageSize,
      sortBy,
      sortOrder,
      search: search || undefined,
    });
    if (result.ok) {
      setData(result.data.items);
      setTotal(result.data.total);
    } else {
      toast.error(result.message);
    }
    setLoading(false);
  }, [page, pageSize, sortBy, sortOrder, search]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleDelete = useCallback(
    async (id: string) => {
      startTransition(async () => {
        const result = await deleteCustomerAction(id);
        if (result.ok) {
          toast.success("Customer moved to trash");
          void fetchData();
        } else {
          toast.error(result.message);
        }
      });
    },
    [fetchData],
  );

  const handleSort = useCallback(
    (column: string) => {
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
    columns: columns(handleDelete),
    getCoreRowModel: getCoreRowModel(),
    state: { columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
  });

  return (
    <div className="space-y-4">
      {/* Search + trash link */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full max-w-sm">
          <SearchInput
            placeholder="Search by name, email, phone…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="hidden md:inline-flex">
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
                    {typeof column.columnDef.header === "string" &&
                    column.columnDef.header
                      ? column.columnDef.header
                      : column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" asChild className="w-full sm:w-auto">
            <Link href="/customers/trash">
              <Archive className="mr-2 h-4 w-4" />
              Trash
            </Link>
          </Button>
        </div>
      </div>

      {/* Loading state */}
      {loading && <TableSkeleton columns={6} rows={6} />}

      {/* Empty state */}
      {!loading && data.length === 0 && (
        <EmptyState
          title="No customers found"
          description={
            search
              ? "Try a different search term."
              : "Add your first customer to get started."
          }
          action={
            !search ? (
              <Button asChild>
                <Link href="/customers/new">Add Customer</Link>
              </Button>
            ) : undefined
          }
        />
      )}

      {/* Desktop table */}
      {!loading && data.length > 0 && (
        <>
          <div className="hidden overflow-hidden rounded-md border md:block">
            <Table containerClassName="max-h-[calc(100vh-16rem)]">
              <TableHeader className="sticky top-0 z-10 bg-muted">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      const isSortable =
                        header.column.id !== "actions" &&
                        header.column.id !== "assignedAgent";
                      return (
                        <TableHead
                          key={header.id}
                          className={cn(
                            "h-10 text-xs font-medium uppercase tracking-wider",
                            isSortable && "cursor-pointer hover:text-foreground",
                          )}
                          onClick={() => {
                            if (isSortable) {
                              handleSort(header.column.id);
                            }
                          }}
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

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {data.map((item) => (
              <CustomerCard key={item.id} item={item} onDelete={handleDelete} />
            ))}
          </div>

          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
