"use client";

import { useState } from "react";
import { LayoutGrid, List } from "lucide-react";
import { SearchInput } from "@/components/common/SearchInput";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "./KanbanBoard";
import { LeadListClient } from "./LeadListClient";

type View = "kanban" | "list";

export function LeadsClient() {
  const [view, setView] = useState<View>("kanban");
  const [search, setSearch] = useState("");

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
            onClick={() => setView("kanban")}
            className="h-8"
          >
            <LayoutGrid className="mr-2 h-4 w-4" /> Kanban
          </Button>
          <Button
            variant={view === "list" ? "default" : "ghost"}
            size="sm"
            onClick={() => setView("list")}
            className="h-8"
          >
            <List className="mr-2 h-4 w-4" /> List
          </Button>
        </div>
      </div>

      {view === "kanban" ? (
        <KanbanBoard search={search} />
      ) : (
        <LeadListClient search={search} />
      )}
    </div>
  );
}
