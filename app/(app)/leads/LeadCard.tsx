"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Phone,
  MessageCircle,
  Mail,
  StickyNote,
  CalendarPlus,
  FileText,
  MoreVertical,
  Eye,
  Pencil,
  ArrowRightLeft,
  XCircle,
  Trash2,
  MapPin,
  Wallet,
  CalendarDays,
  User as UserIcon,
} from "lucide-react";
import type { LeadStatus, InteractionType } from "@prisma/client";
import { cn } from "@/lib/cn";
import { formatPKR } from "@/lib/money/paisa";
import { createInteractionAction } from "@/modules/interactions/interactions.actions";
import type { LeadListItem } from "@/modules/leads/leads.types";
import type { useLeadMutations } from "./leadActions";
import {
  LEAD_STATUS_META,
  LEAD_STATUS_ORDER,
  daysOpen,
  formatLeadDate,
  waLink,
} from "./leadMeta";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  lead: LeadListItem;
  mut: ReturnType<typeof useLeadMutations>;
  onRequestLost: (lead: LeadListItem) => void;
  onRequestConvert: (lead: LeadListItem) => void;
  onDragStart?: (e: React.DragEvent, lead: LeadListItem) => void;
}

export function LeadCard({ lead, mut, onRequestLost, onRequestConvert, onDragStart }: Props) {
  const router = useRouter();
  const converted = lead.status === "BOOKED" || lead.status === "TRAVELLED";

  function logInteraction(type: InteractionType, body: string) {
    void createInteractionAction({ leadId: lead.id, type, body }).then((r) => {
      if (!r.ok) toast.error(r.message);
    });
  }

  function quick(type: InteractionType, body: string, url?: string) {
    logInteraction(type, body);
    if (url && typeof window !== "undefined") window.open(url, "_blank");
  }

  function routeStatus(target: LeadStatus) {
    if (target === lead.status) return;
    if (target === "BOOKED") onRequestConvert(lead);
    else if (target === "LOST") onRequestLost(lead);
    else mut.changeStatus(lead, target);
  }

  return (
    <Card
      draggable
      onDragStart={(e) => onDragStart?.(e, lead)}
      className="group shadow-sm transition-shadow hover:shadow md:cursor-grab md:active:cursor-grabbing"
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/leads/${lead.id}` as Route} className="min-w-0 flex-1 font-medium hover:underline">
            {lead.contactName}
          </Link>
          <div className="relative text-right">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreVertical className="h-4 w-4" />
                  <span className="sr-only">Actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link href={`/leads/${lead.id}` as Route} className="flex items-center">
                    <Eye className="mr-2 h-4 w-4" /> View
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/leads/${lead.id}/edit` as Route} className="flex items-center">
                    <Pencil className="mr-2 h-4 w-4" /> Edit
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => quick("CALL", "Call logged", `tel:${lead.contactPhone}`)}>
                  <Phone className="mr-2 h-4 w-4" /> Call
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => quick("WHATSAPP", "[click-to-chat opened]", waLink(lead.contactPhone))}>
                  <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!lead.contactEmail}
                  onClick={() => lead.contactEmail && quick("EMAIL", "Email opened", `mailto:${lead.contactEmail}`)}
                >
                  <Mail className="mr-2 h-4 w-4" /> Email
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push(`/leads/${lead.id}?tab=interactions` as Route)}>
                  <StickyNote className="mr-2 h-4 w-4" /> Add Note
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.info("Follow-ups arrive with the Tasks module.")}>
                  <CalendarPlus className="mr-2 h-4 w-4" /> Schedule Follow Up
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.info("Quotes arrive with the Quotations module.")}>
                  <FileText className="mr-2 h-4 w-4" /> Create Quote
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {!converted && lead.status !== "LOST" && (
                  <DropdownMenuItem onClick={() => onRequestConvert(lead)}>
                    <ArrowRightLeft className="mr-2 h-4 w-4" /> Convert Lead
                  </DropdownMenuItem>
                )}
                {lead.status !== "LOST" && (
                  <DropdownMenuItem
                    onClick={() => onRequestLost(lead)}
                    className="text-amber-700 focus:bg-amber-100 focus:text-amber-700 dark:focus:bg-amber-950 dark:focus:text-amber-400"
                  >
                    <XCircle className="mr-2 h-4 w-4" /> Mark Lost
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => mut.remove(lead)}
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
          {lead.destination && (
            <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {lead.destination}</p>
          )}
          {lead.budgetPaisa != null && (
            <p className="flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5" /> {formatPKR(lead.budgetPaisa)}</p>
          )}
          {lead.travelDate && (
            <p className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> {formatLeadDate(lead.travelDate)}</p>
          )}
          <p className="flex items-center gap-1.5"><UserIcon className="h-3.5 w-3.5" /> {lead.assignedAgent?.name ?? "Unassigned"}</p>
        </div>

        <div className="mt-2 flex items-center justify-between">
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {daysOpen(lead.createdAt)}d open
          </span>
          <select
            aria-label="Change status"
            className={cn("h-7 rounded-md border border-input bg-transparent px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:hidden")}
            value={lead.status}
            onChange={(e) => routeStatus(e.target.value as LeadStatus)}
          >
            {LEAD_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{LEAD_STATUS_META[s].label}</option>
            ))}
          </select>
        </div>
      </CardContent>
    </Card>
  );
}
