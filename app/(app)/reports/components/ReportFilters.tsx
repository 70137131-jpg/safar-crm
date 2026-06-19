"use client";

import { CalendarDays, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  dateFrom: string;
  dateTo: string;
  agentId: string;
  destination: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  onAgentIdChange: (v: string) => void;
  onDestinationChange: (v: string) => void;
  onApply: () => void;
  isPending: boolean;
}

export function ReportFilters({
  dateFrom,
  dateTo,
  agentId: _agentId,
  destination,
  onDateFromChange,
  onDateToChange,
  onAgentIdChange: _onAgentIdChange,
  onDestinationChange,
  onApply,
  isPending,
}: Props) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="filter-from">
          From
        </label>
        <div className="relative">
          <CalendarDays className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            id="filter-from"
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            className="h-9 rounded-md border bg-background pl-8 pr-3 text-sm outline-none ring-ring focus:ring-2"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="filter-to">
          To
        </label>
        <div className="relative">
          <CalendarDays className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            id="filter-to"
            type="date"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            className="h-9 rounded-md border bg-background pl-8 pr-3 text-sm outline-none ring-ring focus:ring-2"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="filter-destination">
          Destination
        </label>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            id="filter-destination"
            type="text"
            placeholder="All destinations"
            value={destination}
            onChange={(e) => onDestinationChange(e.target.value)}
            className="h-9 w-40 rounded-md border bg-background pl-8 pr-3 text-sm outline-none ring-ring placeholder:text-muted-foreground/60 focus:ring-2"
          />
        </div>
      </div>

      <Button
        id="apply-filters"
        onClick={onApply}
        disabled={isPending}
      >
        {isPending ? "Loading…" : "Apply"}
      </Button>
    </div>
  );
}
