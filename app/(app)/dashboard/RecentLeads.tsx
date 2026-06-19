import Link from "next/link";
import { Workflow } from "lucide-react";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/common/StatusBadge";
import { requireUser } from "@/lib/auth/session";
import { dashboardScope } from "./scope";
import { LEAD_STATUS_META } from "../leads/leadMeta";

// Using LEAD_STATUS_META from leads module

async function getRecentLeads() {
  const user = await requireUser();
  const scope = dashboardScope(user);
  return db.lead.findMany({
    where: { deletedAt: null, ...scope.lead },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: {
      id: true,
      contactName: true,
      contactPhone: true,
      status: true,
      destination: true,
      createdAt: true,
      assignedAgent: { select: { name: true } },
    },
  });
}

export async function RecentLeads() {
  const leads = await getRecentLeads();

  if (leads.length === 0) {
    return (
      <Card className="transition-all duration-200 hover:shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Recent Leads</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center py-8 text-center text-muted-foreground">
            <Workflow className="mb-2 h-8 w-8" />
            <p className="text-sm">No leads yet</p>
            <p className="text-xs">Leads will appear here once created.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="transition-all duration-200 hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-semibold">Recent Leads</CardTitle>
        <Link href="/leads" className="text-xs text-muted-foreground hover:text-foreground">
          View all →
        </Link>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {leads.map((lead) => {
            const meta = LEAD_STATUS_META[lead.status];
            return (
              <div key={lead.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{lead.contactName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {lead.destination ?? "No destination"} · {lead.assignedAgent?.name ?? "Unassigned"}
                  </p>
                </div>
                <StatusBadge tone={meta?.tone ?? "neutral"}>
                  {meta?.label ?? lead.status.replace("_", " ")}
                </StatusBadge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
