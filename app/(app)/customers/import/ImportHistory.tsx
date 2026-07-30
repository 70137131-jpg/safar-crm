"use client";

import Papa from "papaparse";
import { Download } from "lucide-react";
import type { ImportRunDTO } from "@/modules/customers/customers.types";
import { Button } from "@/components/ui/button";

function downloadErrors(run: ImportRunDTO) {
  const csv = Papa.unparse(run.errors.map((error) => ({ row: error.row, name: error.name ?? "", error: error.error ?? "" })));
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${run.fileName.replace(/\.[^.]+$/, "")}-errors.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ImportHistory({ runs }: { runs: ImportRunDTO[] }) {
  if (runs.length === 0) return null;
  return (
    <section className="mt-10 space-y-3">
      <h2 className="text-base font-semibold">Recent imports</h2>
      {runs.map((run) => (
        <div key={run.id} className="flex flex-col gap-2 rounded-lg border bg-card p-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{run.fileName}</div>
            <div className="text-xs text-muted-foreground">
              {run.fileType.toUpperCase()} · {run.successCount}/{run.totalRows} imported · {run.errorCount} errors · {run.createdBy.name}
            </div>
          </div>
          <span className="text-xs font-medium">{run.status}</span>
          {run.errors.length > 0 ? (
            <Button size="sm" variant="outline" onClick={() => downloadErrors(run)}>
              <Download className="mr-2 h-4 w-4" />Errors
            </Button>
          ) : null}
        </div>
      ))}
    </section>
  );
}
