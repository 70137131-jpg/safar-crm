"use client";

import { useEffect, useState } from "react";
import { LayoutGrid, List } from "lucide-react";
import { SearchInput } from "@/components/common/SearchInput";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "./KanbanBoard";
import { LeadListClient } from "./LeadListClient";
import { useUrlState } from "./useUrlFilters";

type View = "kanban" | "list";

export function LeadsClient({ canFilterByAgent }: { canFilterByAgent: boolean }) {
  const { params, set } = useUrlState();
  const view: View = params.get("view") === "list" ? "list" : "kanban";

  // Local mirror of the search box so typing stays snappy; the value is pushed
  // to the URL (debounced) for shareable, restorable filters.
  const [search, setSearch] = useState(() => params.get("q") ?? "");

  useEffect(() => {
    const t = setTimeout(() => {
      set({ q: search || undefined, page: undefined });
    }, 300);
    return () => clearTimeout(t);
    // `set` changes identity on every navigation; depending on it would reset
    // the debounce timer mid-type. Search is the only real trigger here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          placeholder="Search by name, phone, email, destination…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="inline-flex rounded-md border p-0.5">
          <Button
            variant={view === "kanban" ? "default" : "ghost"}
            size="sm"
            onClick={() => set({ view: undefined })}
            className="h-8"
          >
            <LayoutGrid className="mr-2 h-4 w-4" /> Kanban
          </Button>
          <Button
            variant={view === "list" ? "default" : "ghost"}
            size="sm"
            onClick={() => set({ view: "list" })}
            className="h-8"
          >
            <List className="mr-2 h-4 w-4" /> List
          </Button>
        </div>
      </div>

      {view === "kanban" ? (
        <KanbanBoard search={search} />
      ) : (
        <LeadListClient search={search} canFilterByAgent={canFilterByAgent} />
      )}
    </div>
  );
}
