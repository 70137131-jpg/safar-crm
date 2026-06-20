"use client";

import { useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import {
  User,
  Mail,
  Phone,
  MapPin,
  Globe,
  Shield,
  Calendar,
  Pencil,
  StickyNote,
  MessageSquare,
  Briefcase,
  FileText,
  FolderOpen,
  ListChecks,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { EmptyState } from "@/components/common/EmptyState";
import { DocumentsPanel } from "@/components/documents/DocumentsPanel";
import type { CustomerDTO } from "@/modules/customers/customers.types";
import { toWhatsAppLink } from "@/lib/phone/normalize";
import { CustomerBookingsTab } from "./CustomerBookingsTab";
import { CustomerQuotationsTab } from "./CustomerQuotationsTab";
import { Button } from "@/components/ui/button";
import { CreateTaskDialog } from "../../tasks/CreateTaskDialog";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeZone: "Asia/Karachi",
  }).format(new Date(date));
}

function maskPassport(passportNo: string | null): string {
  if (!passportNo || passportNo.length < 4) return "—";
  return `****${passportNo.slice(-4)}`;
}

function isExpiringSoon(date: Date | string | null): boolean {
  if (!date) return false;
  const sixMonths = new Date();
  sixMonths.setMonth(sixMonths.getMonth() + 6);
  return new Date(date) <= sixMonths;
}

// ─── Tab definitions ────────────────────────────────────────────────────────

const TABS = [
  { id: "overview", label: "Overview", icon: User },
  { id: "interactions", label: "Interactions", icon: MessageSquare },
  { id: "bookings", label: "Bookings", icon: Briefcase },
  { id: "quotations", label: "Quotations", icon: FileText },
  { id: "documents", label: "Documents", icon: FolderOpen },
] as const;
type TabId = (typeof TABS)[number]["id"];

// ─── Component ──────────────────────────────────────────────────────────────

interface Props {
  customer: CustomerDTO;
  docCaps?: { canUpload: boolean; canDelete: boolean };
  bookingCaps?: { canCreate: boolean };
  taskCaps?: { canCreate: boolean; canAssign: boolean };
  quotationCaps?: { canCreate: boolean };
}

export function CustomerDetailClient({
  customer,
  docCaps,
  bookingCaps,
  taskCaps,
  quotationCaps,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  return (
    <div className="space-y-6">
      {/* Profile card */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <User className="h-7 w-7" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">{customer.name}</h2>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {customer.nationality && (
                  <span className="inline-flex items-center gap-1">
                    <Globe className="h-3.5 w-3.5" />
                    {customer.nationality}
                  </span>
                )}
                {customer.assignedAgent && (
                  <span>Agent: {customer.assignedAgent.name}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {taskCaps?.canCreate && (
              <CreateTaskDialog
                canAssign={taskCaps.canAssign}
                customerId={customer.id}
                contextLabel={`Customer · ${customer.name}`}
                trigger={(open) => (
                  <Button variant="outline" onClick={open}>
                    <ListChecks className="mr-2 h-4 w-4" />
                    New Task
                  </Button>
                )}
              />
            )}
            <Link
              href={`/customers/${customer.id}/edit` as Route}
              className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-accent"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Link>
          </div>
        </div>

        {/* Contact info grid */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <InfoCard
            icon={<Mail className="h-4 w-4" />}
            label="Email"
            value={customer.email}
            href={customer.email ? `mailto:${customer.email}` : undefined}
          />
          <InfoCard
            icon={<Phone className="h-4 w-4" />}
            label="Phone"
            value={customer.phone}
            href={customer.phone ? `tel:${customer.phone}` : undefined}
            extra={
              customer.phone ? (
                <a
                  href={toWhatsAppLink(customer.phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 text-xs text-green-600 hover:underline dark:text-green-400"
                >
                  WhatsApp
                </a>
              ) : null
            }
          />
          <InfoCard
            icon={<MapPin className="h-4 w-4" />}
            label="Address"
            value={customer.address}
          />
        </div>
      </div>

      {/* Passport + DOB card */}
      <div className="rounded-lg border bg-card p-6">
        <h3 className="mb-4 text-sm font-medium text-muted-foreground">
          <Shield className="mr-1.5 inline h-4 w-4" />
          Sensitive Information
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <InfoCard
            label="Passport"
            value={maskPassport(customer.passportNo)}
          />
          <InfoCard
            label="Passport Expiry"
            value={formatDate(customer.passportExpiry)}
            warning={isExpiringSoon(customer.passportExpiry)}
            warningText="Expires within 6 months"
          />
          <InfoCard
            label="Date of Birth"
            value={formatDate(customer.dob)}
          />
        </div>
      </div>

      {/* Notes */}
      {customer.notes && (
        <div className="rounded-lg border bg-card p-6">
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">
            <StickyNote className="mr-1.5 inline h-4 w-4" />
            Notes
          </h3>
          <p className="whitespace-pre-wrap text-sm">{customer.notes}</p>
        </div>
      )}

      {/* Metadata */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>
          <Calendar className="mr-1 inline h-3.5 w-3.5" />
          Created {formatDate(customer.createdAt)}
        </span>
        <span>Updated {formatDate(customer.updatedAt)}</span>
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

      {/* Tab content */}
      <div className="min-h-[200px]">
        {activeTab === "overview" && (
          <div className="text-sm text-muted-foreground">
            Customer overview and activity timeline will appear here.
          </div>
        )}
        {activeTab === "interactions" && (
          <EmptyState
            icon={<MessageSquare className="h-8 w-8" />}
            title="No interactions yet"
            description="Interactions will be logged here once the module is built."
          />
        )}
        {activeTab === "bookings" && (
          <CustomerBookingsTab
            customerId={customer.id}
            canCreate={bookingCaps?.canCreate ?? false}
          />
        )}
        {activeTab === "quotations" && (
          <CustomerQuotationsTab
            customerId={customer.id}
            canCreate={quotationCaps?.canCreate ?? false}
          />
        )}
        {activeTab === "documents" && (
          <DocumentsPanel
            customerId={customer.id}
            canUpload={docCaps?.canUpload ?? false}
            canDelete={docCaps?.canDelete ?? false}
          />
        )}
      </div>
    </div>
  );
}

// ─── Info card helper ───────────────────────────────────────────────────────

function InfoCard({
  icon,
  label,
  value,
  href,
  extra,
  warning,
  warningText,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string | null | undefined;
  href?: string;
  extra?: React.ReactNode;
  warning?: boolean;
  warningText?: string;
}) {
  const display = value || "—";
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </p>
      <div className="flex items-center">
        {href ? (
          <a href={href} className="text-sm hover:underline">
            {display}
          </a>
        ) : (
          <span className={cn("text-sm", warning && "font-medium text-amber-700 dark:text-amber-400")}>
            {display}
          </span>
        )}
        {extra}
      </div>
      {warning && warningText && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {warningText}
        </p>
      )}
    </div>
  );
}
