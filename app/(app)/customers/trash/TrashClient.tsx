"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { RotateCcw, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  listDeletedCustomersAction,
  restoreCustomerAction,
} from "@/modules/customers/customers.actions";
import type { CustomerListItem } from "@/modules/customers/customers.types";

function formatDate(date: Date | null) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeZone: "Asia/Karachi",
  }).format(new Date(date));
}

export function TrashClient() {
  const [, startTransition] = useTransition();
  const [data, setData] = useState<CustomerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const result = await listDeletedCustomersAction(page, 50);
    if (result.ok) {
      setData(result.data.items);
      setTotalPages(result.data.totalPages);
    } else {
      toast.error(result.message);
    }
    setLoading(false);
  }, [page]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleRestore = useCallback(
    async (id: string) => {
      startTransition(async () => {
        const result = await restoreCustomerAction(id);
        if (result.ok) {
          toast.success("Customer restored");
          void fetchData();
        } else {
          toast.error(result.message);
        }
      });
    },
    [fetchData],
  );

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState
        title="Trash is empty"
        description="No deleted customers."
        action={
          <Button variant="outline" asChild>
            <Link href="/customers">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Customers
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {data.map((item) => (
        <Card key={item.id}>
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{item.name}</p>
              <div className="mt-0.5 flex flex-wrap gap-x-4 text-sm text-muted-foreground">
                {item.email && <span>{item.email}</span>}
                {item.phone && <span>{item.phone}</span>}
                <span>Deleted {formatDate(item.deletedAt)}</span>
              </div>
            </div>
            <div className="flex gap-1">
              <ConfirmDialog
                title="Restore customer?"
                description="This customer will be moved back to the active list."
                confirmLabel="Restore"
                onConfirm={() => handleRestore(item.id)}
                trigger={(openDialog) => (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openDialog}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Restore
                  </Button>
                )}
              />
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
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
    </div>
  );
}
