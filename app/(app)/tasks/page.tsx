import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { TaskListClient } from "./TaskListClient";

export const metadata: Metadata = {
  title: "Tasks",
};

export default async function TasksPage() {
  const user = await getCurrentUser();
  const canCreate = !!user && can(user, "tasks:create");
  const canAssign = !!user && can(user, "tasks:assign");
  // AGENTs are always scoped to their own tasks; everyone else can switch to all.
  const canViewOthers = !!user && user.role !== "AGENT" && can(user, "tasks:view");

  return (
    <PageWrapper>
      <PageHeader
        title="Tasks"
        description="Follow-ups, reminders and overdue items."
      />
      <TaskListClient
        canCreate={canCreate}
        canAssign={canAssign}
        canViewOthers={canViewOthers}
      />
    </PageWrapper>
  );
}
