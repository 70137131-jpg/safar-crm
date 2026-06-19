import type { LeadStatus } from "@prisma/client";
import type { StatusTone } from "@/components/common/StatusBadge";

/**
 * Client-safe presentation metadata + helpers shared by the kanban, list,
 * and detail views. No server imports — safe in client components.
 */

export const LEAD_STATUS_ORDER: readonly LeadStatus[] = [
  "NEW",
  "CONTACTED",
  "QUOTATION_SENT",
  "NEGOTIATING",
  "BOOKED",
  "TRAVELLED",
  "LOST",
];

export const LEAD_STATUS_META: Record<LeadStatus, { label: string; tone: StatusTone }> = {
  NEW: { label: "New", tone: "neutral" },
  CONTACTED: { label: "Contacted", tone: "info" },
  QUOTATION_SENT: { label: "Quotation Sent", tone: "info" },
  NEGOTIATING: { label: "Negotiating", tone: "warning" },
  BOOKED: { label: "Booked", tone: "success" },
  TRAVELLED: { label: "Travelled", tone: "success" },
  LOST: { label: "Lost", tone: "danger" },
};

export const TRIP_PURPOSE_OPTIONS = [
  { value: "UMRAH", label: "Umrah" },
  { value: "HAJJ", label: "Hajj" },
  { value: "LEISURE_TOUR", label: "Leisure Tour" },
  { value: "BUSINESS", label: "Business" },
  { value: "FAMILY_VISIT", label: "Family Visit" },
  { value: "EDUCATION", label: "Education" },
  { value: "MEDICAL", label: "Medical" },
  { value: "OTHER", label: "Other" },
] as const;

export const ROUTE_SHAPE_OPTIONS = [
  { value: "ONE_WAY", label: "One Way" },
  { value: "ROUND_TRIP", label: "Round Trip" },
  { value: "MULTI_CITY", label: "Multi-City" },
] as const;

export const LOST_REASON_OPTIONS = [
  { value: "PRICE", label: "Price" },
  { value: "COMPETITOR", label: "Competitor" },
  { value: "NO_RESPONSE", label: "No Response" },
  { value: "CHANGED_PLANS", label: "Changed Plans" },
  { value: "NO_VISA", label: "No Visa" },
  { value: "OTHER", label: "Other" },
] as const;

export function labelFor(
  options: readonly { value: string; label: string }[],
  value: string | null | undefined,
): string {
  if (!value) return "—";
  return options.find((o) => o.value === value)?.label ?? value;
}

export function daysOpen(createdAt: Date | string): number {
  const ms = Date.now() - new Date(createdAt).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function formatLeadDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeZone: "Asia/Karachi",
  }).format(new Date(d));
}

export function formatLeadDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Karachi",
  }).format(new Date(d));
}

/** Build a wa.me click-to-chat URL from an E.164 number (client-safe). */
export function waLink(e164: string): string {
  return `https://wa.me/${e164.replace(/^\+/, "")}`;
}

export function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().split("T")[0] ?? "";
}
