import Link from "next/link";
import { ListChecks, AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { dashboardScope } from "./scope";

const TYPE_LABELS: Record<string, string> = {
  FOLLOW_UP: "Follow up",
  PASSPORT_EXPIRY: "Passport expiry",
  PAYMENT_DUE: "Payment due",
  OTHER: "Task",
};

async function getOpenTasks() {
  const user = await requireUser();
  const scope = dashboardScope(user);
  const tasks = await db.task.findMany({
    where: { status: "OPEN", ...scope.task },
    orderBy: { dueDate: "asc" },
    take: 8,
    select: {
      id: true,
      title: true,
      dueDate: true,
      type: true,
      assignedTo: { select: { name: true } },
    },
  });
  const now = Date.now();
  return tasks.map((t) => ({ ...t, overdue: t.dueDate.getTime() < now }));
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-PK", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Karachi",
  }).format(date);
}

export async function TasksWidget() {
  const tasks = await getOpenTasks();

  return (
    <Card className="transition-all duration-200 hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-semibold">Tasks &amp; Reminders</CardTitle>
        <Link href="/tasks" className="text-xs text-muted-foreground hover:text-foreground">
          View all →
        </Link>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-center text-muted-foreground">
            <ListChecks className="mb-2 h-8 w-8" />
            <p className="text-sm">No open tasks</p>
            <p className="text-xs">Follow-ups and reminders will appear here.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {tasks.map((task) => {
              const overdue = task.overdue;
              return (
                <div key={task.id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{task.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {TYPE_LABELS[task.type] ?? task.type} · {task.assignedTo.name}
                    </p>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 text-xs ${
                      overdue
                        ? "font-medium text-red-600 dark:text-red-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    {overdue && <AlertTriangle className="h-3.5 w-3.5" />}
                    {formatDate(task.dueDate)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
