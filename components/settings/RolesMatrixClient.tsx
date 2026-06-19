"use client";

import { useState } from "react";
import { Check, X, Minus } from "lucide-react";
import { cn } from "@/lib/cn";
import { StatusBadge, type StatusTone } from "@/components/common/StatusBadge";

export type Cell = "yes" | "no" | "na";

export interface RoleMatrix {
  role: string;
  description: string;
  rows: { resource: string; create: Cell; view: Cell; update: Cell; delete: Cell }[];
}

const ROLE_TONE: Record<string, StatusTone> = {
  ADMIN: "danger",
  MANAGER: "info",
  AGENT: "success",
  ACCOUNTANT: "warning",
};

const ACTIONS = ["create", "view", "update", "delete"] as const;

function CellMark({ value }: { value: Cell }) {
  if (value === "yes") return <Check className="mx-auto h-4 w-4 text-green-600 dark:text-green-400" />;
  if (value === "no") return <X className="mx-auto h-4 w-4 text-muted-foreground/60" />;
  return <Minus className="mx-auto h-4 w-4 text-muted-foreground/30" aria-label="Not applicable" />;
}

export function RolesMatrixClient({ matrix }: { matrix: RoleMatrix[] }) {
  const [active, setActive] = useState(matrix[0]?.role ?? "ADMIN");
  const current = matrix.find((m) => m.role === active) ?? matrix[0];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Roles and permissions are fixed in v1. This view is read-only.
      </p>

      {/* Role tabs */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Roles">
        {matrix.map((m) => (
          <button
            key={m.role}
            type="button"
            role="tab"
            aria-selected={m.role === active}
            onClick={() => setActive(m.role)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
              m.role === active ? "border-primary bg-accent" : "hover:bg-accent/50",
            )}
          >
            {m.role}
          </button>
        ))}
      </div>

      {current && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge tone={ROLE_TONE[current.role] ?? "neutral"}>{current.role}</StatusBadge>
            <p className="text-sm text-muted-foreground">{current.description}</p>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Module</th>
                  {ACTIONS.map((a) => (
                    <th key={a} className="px-4 py-2 text-center font-medium">
                      {a}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {current.rows.map((row) => (
                  <tr key={row.resource} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">{row.resource}</td>
                    <td className="px-4 py-2"><CellMark value={row.create} /></td>
                    <td className="px-4 py-2"><CellMark value={row.view} /></td>
                    <td className="px-4 py-2"><CellMark value={row.update} /></td>
                    <td className="px-4 py-2"><CellMark value={row.delete} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
