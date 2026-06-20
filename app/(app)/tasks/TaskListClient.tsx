"use client";

import { useCallback, useEffect, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import type { TaskStatus, TaskType } from "@prisma/client";
import { Circle, CheckCircle2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  listTasksAction,
  completeTaskAction,
} from "@/modules/tasks/tasks.actions";
import type { TaskListItem } from "@/modules/tasks/tasks.types";
import { CreateTaskDialog } from "./CreateTaskDialog";
import { TASK_TYPE_META, dueLabel, isOverdue } from "./taskMeta";

type StatusFilter = TaskStatus | "ALL";

function linkFor(
  task: TaskListItem,
): { href: Route; label: string } | null {
  if (task.bookingId)
    return { href: `/bookings/${task.bookingId}` as Route, label: "Booking" };
  if (task.leadId)
    return { href: `/leads/${task.leadId}` as Route, label: "Lead" };
  if (task.customerId)
    return { href: `/customers/${task.customerId}` as Route, label: "Customer" };
  return null;
}

function TaskRow({
  task,
  showAssignee,
  onComplete,
}: {
  task: TaskListItem;
  showAssignee: boolean;
  onComplete: (id: string) => void;
}) {
  const meta = TASK_TYPE_META[task.type];
  const Icon = meta.icon;
  const overdue = isOverdue(task.dueDate, task.status);
  const done = task.status === "DONE";
  const link = linkFor(task);

  return (
    <li className="flex items-start gap-3 rounded-lg border bg-card p-3">
      <button
        type="button"
        onClick={() => !done && onComplete(task.id)}
        disabled={done}
        aria-label={done ? "Completed" : "Mark task done"}
        className={cn(
          "mt-0.5 shrink-0 rounded-full transition-colors",
          done
            ? "text-green-600 dark:text-green-500"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {done ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : (
          <Circle className="h-5 w-5" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm font-medium",
            done && "text-muted-foreground line-through",
          )}
        >
          {task.title}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <StatusBadge tone={meta.tone}>
            <Icon className="mr-1 h-3 w-3" />
            {meta.label}
          </StatusBadge>
          {link && (
            <Link
              href={link.href}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              {link.label}
            </Link>
          )}
          {showAssignee && task.assignedTo && (
            <span className="text-muted-foreground">{task.assignedTo.name}</span>
          )}
        </div>
      </div>

      <div className="shrink-0 text-right text-xs">
        <span
          className={cn(
            overdue
              ? "font-medium text-red-600 dark:text-red-400"
              : "text-muted-foreground",
          )}
        >
          {dueLabel(task.dueDate, task.status)}
        </span>
      </div>
    </li>
  );
}

export function TaskListClient({
  canCreate,
  canAssign,
  canViewOthers,
}: {
  canCreate: boolean;
  canAssign: boolean;
  canViewOthers: boolean;
}) {
  const [items, setItems] = useState<TaskListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [status, setStatus] = useState<StatusFilter>("OPEN");
  const [type, setType] = useState<TaskType | "">("");
  const [mine, setMine] = useState(true);
  const [loading, setLoading] = useState(true);

  const totalPages = Math.ceil(total / pageSize);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const r = await listTasksAction({
      page,
      pageSize,
      status: status === "ALL" ? undefined : status,
      type: type || undefined,
      mine,
    });
    if (r.ok) {
      setItems(r.data.items);
      setTotal(r.data.total);
    } else {
      toast.error(r.message);
    }
    setLoading(false);
  }, [page, pageSize, status, type, mine]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleComplete = useCallback(
    async (id: string) => {
      const r = await completeTaskAction(id);
      if (r.ok) {
        toast.success("Task completed");
        void fetchData();
      } else {
        toast.error(r.message);
      }
    },
    [fetchData],
  );

  const statusTabs: { value: StatusFilter; label: string }[] = [
    { value: "OPEN", label: "Open" },
    { value: "DONE", label: "Done" },
    { value: "ALL", label: "All" },
  ];

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border p-0.5">
            {statusTabs.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => {
                  setStatus(t.value);
                  setPage(1);
                }}
                className={cn(
                  "rounded px-3 py-1 text-sm font-medium transition-colors",
                  status === t.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value as TaskType | "");
              setPage(1);
            }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Filter by type"
          >
            <option value="">All types</option>
            {(["FOLLOW_UP", "PASSPORT_EXPIRY", "PAYMENT_DUE", "OTHER"] as const).map(
              (t) => (
                <option key={t} value={t}>
                  {TASK_TYPE_META[t].label}
                </option>
              ),
            )}
          </select>

          {canViewOthers && (
            <div className="inline-flex rounded-md border p-0.5">
              <button
                type="button"
                onClick={() => {
                  setMine(true);
                  setPage(1);
                }}
                className={cn(
                  "rounded px-3 py-1 text-sm font-medium transition-colors",
                  mine
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Mine
              </button>
              <button
                type="button"
                onClick={() => {
                  setMine(false);
                  setPage(1);
                }}
                className={cn(
                  "rounded px-3 py-1 text-sm font-medium transition-colors",
                  !mine
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                All
              </button>
            </div>
          )}
        </div>

        {canCreate && (
          <CreateTaskDialog canAssign={canAssign} onCreated={fetchData} />
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No tasks"
          description={
            status === "OPEN"
              ? "You're all caught up — no open tasks."
              : "No tasks match this filter."
          }
        />
      ) : (
        <>
          <ul className="space-y-2">
            {items.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                showAssignee={canViewOthers && !mine}
                onComplete={handleComplete}
              />
            ))}
          </ul>

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 pt-2">
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
        </>
      )}
    </div>
  );
}
