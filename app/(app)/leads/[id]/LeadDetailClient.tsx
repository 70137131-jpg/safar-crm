"use client";

import { useCallback, useEffect, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import {
  Pencil,
  MapPin,
  Wallet,
  CalendarDays,
  User as UserIcon,
  Phone,
  MessageCircle,
  Mail,
  Users,
  StickyNote,
  History,
  Info,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import type { InteractionType } from "@prisma/client";
import { cn } from "@/lib/cn";
import { formatPKR } from "@/lib/money/paisa";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import {
  createInteractionAction,
  listInteractionsByLeadAction,
} from "@/modules/interactions/interactions.actions";
import { getLeadHistoryAction } from "@/modules/leads/leads.actions";
import type { InteractionDTO } from "@/modules/interactions/interactions.types";
import type { LeadDTO, LeadStatusEventDTO } from "@/modules/leads/leads.types";
import {
  LEAD_STATUS_META,
  TRIP_PURPOSE_OPTIONS,
  ROUTE_SHAPE_OPTIONS,
  LOST_REASON_OPTIONS,
  labelFor,
  formatLeadDate,
  formatLeadDateTime,
} from "../leadMeta";

const INTERACTION_TYPE_OPTIONS: { value: InteractionType; label: string; icon: typeof Phone }[] = [
  { value: "NOTE", label: "Note", icon: StickyNote },
  { value: "CALL", label: "Call", icon: Phone },
  { value: "WHATSAPP", label: "WhatsApp", icon: MessageCircle },
  { value: "EMAIL", label: "Email", icon: Mail },
  { value: "MEETING", label: "Meeting", icon: Users },
];

const TYPE_ICON: Record<InteractionType, typeof Phone> = {
  NOTE: StickyNote,
  CALL: Phone,
  WHATSAPP: MessageCircle,
  EMAIL: Mail,
  MEETING: Users,
};

const TABS = [
  { id: "overview", label: "Overview", icon: Info },
  { id: "interactions", label: "Interactions", icon: MessageCircle },
  { id: "history", label: "History", icon: History },
] as const;
type TabId = (typeof TABS)[number]["id"];

function isTabId(v: string | undefined): v is TabId {
  return v === "overview" || v === "interactions" || v === "history";
}

export function LeadDetailClient({
  lead,
  initialTab,
}: {
  lead: LeadDTO;
  initialTab?: string;
}) {
  const [activeTab, setActiveTab] = useState<TabId>(
    isTabId(initialTab) ? initialTab : "overview",
  );
  const meta = LEAD_STATUS_META[lead.status];

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <UserIcon className="h-7 w-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">{lead.contactName}</h2>
                <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <a href={`tel:${lead.contactPhone}`} className="hover:underline">
                  {lead.contactPhone}
                </a>
                {lead.contactEmail && (
                  <a href={`mailto:${lead.contactEmail}`} className="hover:underline">
                    {lead.contactEmail}
                  </a>
                )}
              </div>
            </div>
          </div>
          <Link
            href={`/leads/${lead.id}/edit` as Route}
            className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-accent"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </Link>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field icon={<MapPin className="h-4 w-4" />} label="Destination" value={lead.destination} />
          <Field
            icon={<Wallet className="h-4 w-4" />}
            label="Budget"
            value={lead.budgetPaisa != null ? formatPKR(lead.budgetPaisa) : null}
          />
          <Field
            icon={<CalendarDays className="h-4 w-4" />}
            label="Travel Date"
            value={formatLeadDate(lead.travelDate)}
          />
          <Field
            icon={<UserIcon className="h-4 w-4" />}
            label="Assigned Agent"
            value={lead.assignedAgent?.name ?? "Unassigned"}
          />
          <Field label="Trip Purpose" value={labelFor(TRIP_PURPOSE_OPTIONS, lead.tripPurpose)} />
          <Field label="Route" value={labelFor(ROUTE_SHAPE_OPTIONS, lead.routeShape)} />
          <Field label="Pax" value={lead.pax != null ? String(lead.pax) : null} />
          <Field label="Source" value={lead.source} />
          {lead.status === "LOST" && (
            <Field label="Lost Reason" value={labelFor(LOST_REASON_OPTIONS, lead.lostReason)} />
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <nav className="-mb-px flex gap-0 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                  activeTab === tab.id
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="min-h-[200px]">
        {activeTab === "overview" && <Overview lead={lead} />}
        {activeTab === "interactions" && <InteractionsTab leadId={lead.id} />}
        {activeTab === "history" && <HistoryTab leadId={lead.id} />}
      </div>
    </div>
  );
}

function Overview({ lead }: { lead: LeadDTO }) {
  return (
    <div className="space-y-4 text-sm">
      {lead.lostNotes && (
        <div className="rounded-lg border bg-card p-4">
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">Lost Notes</h3>
          <p className="whitespace-pre-wrap">{lead.lostNotes}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>Created {formatLeadDateTime(lead.createdAt)}</span>
        <span>Updated {formatLeadDateTime(lead.updatedAt)}</span>
      </div>
    </div>
  );
}

// ─── Interactions ─────────────────────────────────────────────────────────────

function InteractionsTab({ leadId }: { leadId: string }) {
  const [items, setItems] = useState<InteractionDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<InteractionType>("NOTE");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const r = await listInteractionsByLeadAction(leadId);
    if (r.ok) setItems(r.data);
    else toast.error(r.message);
    setLoading(false);
  }, [leadId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    const r = await createInteractionAction({ leadId, type, body });
    setSubmitting(false);
    if (r.ok) {
      setBody("");
      setType("NOTE");
      void fetchData();
    } else {
      toast.error(r.message);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap gap-1.5">
          {INTERACTION_TYPE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setType(opt.value)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium",
                  type === opt.value
                    ? "border-primary bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-accent",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {opt.label}
              </button>
            );
          })}
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Log a call, message, meeting or note…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={submitting || !body.trim()}
          >
            <Send className="mr-2 h-4 w-4" />
            {submitting ? "Saving…" : "Log Interaction"}
          </Button>
        </div>
      </form>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<MessageCircle className="h-8 w-8" />}
          title="No interactions yet"
          description="Log the first call, message or note above."
        />
      ) : (
        <ul className="space-y-3">
          {items.map((it) => {
            const Icon = TYPE_ICON[it.type];
            return (
              <li key={it.id} className="flex gap-3 rounded-lg border bg-card p-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {it.type}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatLeadDateTime(it.occurredAt)}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{it.body}</p>
                  {it.createdBy && (
                    <p className="mt-1 text-xs text-muted-foreground">— {it.createdBy.name}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── History ──────────────────────────────────────────────────────────────────

function HistoryTab({ leadId }: { leadId: string }) {
  const [items, setItems] = useState<LeadStatusEventDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      const r = await getLeadHistoryAction(leadId);
      if (!active) return;
      if (r.ok) setItems(r.data);
      else toast.error(r.message);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [leadId]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<History className="h-8 w-8" />}
        title="No status changes yet"
        description="Stage transitions will be recorded here."
      />
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((ev) => {
        const toMeta = LEAD_STATUS_META[ev.toStatus];
        const fromMeta = ev.fromStatus ? LEAD_STATUS_META[ev.fromStatus] : null;
        return (
          <li key={ev.id} className="flex items-start gap-3 rounded-lg border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {fromMeta && (
                <>
                  <StatusBadge tone={fromMeta.tone}>{fromMeta.label}</StatusBadge>
                  <span className="text-muted-foreground">→</span>
                </>
              )}
              <StatusBadge tone={toMeta.tone}>{toMeta.label}</StatusBadge>
            </div>
            <div className="ml-auto text-right text-xs text-muted-foreground">
              <div>{formatLeadDateTime(ev.occurredAt)}</div>
              {ev.byUser && <div>{ev.byUser.name}</div>}
              {ev.reason && <div className="italic">{ev.reason}</div>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Field helper ─────────────────────────────────────────────────────────────

function Field({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="text-sm">{value || "—"}</p>
    </div>
  );
}
