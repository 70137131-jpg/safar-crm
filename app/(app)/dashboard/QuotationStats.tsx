import Link from "next/link";
import { FileText } from "lucide-react";
import { db } from "@/lib/db";
import { formatPKR, type Paisa } from "@/lib/money/paisa";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { dashboardScope } from "./scope";

const STATUS_ORDER = ["DRAFT", "SENT", "ACCEPTED", "EXPIRED"] as const;
const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  ACCEPTED: "Accepted",
  EXPIRED: "Expired",
};

async function getQuotationStats() {
  const user = await requireUser();
  const scope = dashboardScope(user);
  const [grouped, accepted] = await Promise.all([
    db.quotation.groupBy({
      by: ["status"],
      where: scope.quotation,
      _count: { _all: true },
    }),
    db.quotation.aggregate({
      where: { status: "ACCEPTED", ...scope.quotation },
      _sum: { totalPaisa: true },
    }),
  ]);

  const counts: Record<string, number> = {};
  for (const row of grouped) counts[row.status] = row._count._all;

  return {
    counts,
    acceptedValue: (accepted._sum.totalPaisa ?? 0n) as Paisa,
  };
}

export async function QuotationStats() {
  const { counts, acceptedValue } = await getQuotationStats();

  return (
    <Card className="transition-all duration-200 hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="h-4 w-4 text-muted-foreground" />
          Quotations
        </CardTitle>
        <Link href="/quotations" className="text-xs text-muted-foreground hover:text-foreground">
          View all →
        </Link>
      </CardHeader>
      <CardContent>
        <div>
          <p className="text-xs text-muted-foreground">Accepted value</p>
          <p className="text-2xl font-bold tracking-tight">{formatPKR(acceptedValue)}</p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {STATUS_ORDER.map((status) => (
            <div key={status} className="rounded-md border bg-muted/30 px-3 py-2">
              <p className="text-lg font-semibold">{counts[status] ?? 0}</p>
              <p className="text-xs text-muted-foreground">{STATUS_LABELS[status]}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
