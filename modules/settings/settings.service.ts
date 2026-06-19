import { Resend } from "resend";
import type { UserContext } from "@/lib/permissions/types";
import { requirePermission } from "@/lib/permissions";
import { IntegrationError } from "@/lib/errors";
import { withAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import * as repo from "./settings.repository";
import type { SettingsDTO } from "./settings.types";
import type {
  TestEmailInput,
  UpdateAgencyInput,
  UpdateEmailInput,
  UpdateNotificationsInput,
} from "./settings.schemas";

/**
 * Settings service — manages the agency-wide singleton. Reads need
 * `settings:view`; writes need `settings:update` (ADMIN only per RBAC).
 * Every write is audited.
 */

type SettingsRow = NonNullable<Awaited<ReturnType<typeof repo.get>>>;

const DEFAULTS: SettingsDTO = {
  agencyName: "Safar CRM",
  agencyPhone: null,
  agencyEmail: null,
  agencyAddress: null,
  agencyWebsite: null,
  agencyLogoKey: null,
  taxPercentage: 0,
  defaultCurrency: "PKR",
  defaultTimezone: "Asia/Karachi",
  leadSources: [],
  quoteValidDays: 14,
  senderName: null,
  senderEmail: null,
  replyToEmail: null,
  notifyPassportExpiry: true,
  notifyPaymentDue: true,
  notifyDailySummary: false,
  notifyQuotationExpiry: true,
  notifyOverdueTasks: true,
  passportExpiryWarnDays: 180,
  paymentDueWarnDays: 7,
  quotationExpiryWarnDays: 3,
  overdueTaskWarnDays: 1,
  updatedAt: null,
};

function toDTO(row: SettingsRow): SettingsDTO {
  return {
    agencyName: row.agencyName,
    agencyPhone: row.agencyPhone,
    agencyEmail: row.agencyEmail,
    agencyAddress: row.agencyAddress,
    agencyWebsite: row.agencyWebsite,
    agencyLogoKey: row.agencyLogoKey,
    taxPercentage: row.defaultTaxBps / 100,
    defaultCurrency: row.defaultCurrency,
    defaultTimezone: row.defaultTimezone,
    leadSources: row.leadSources,
    quoteValidDays: row.quoteValidDays,
    senderName: row.senderName,
    senderEmail: row.senderEmail,
    replyToEmail: row.replyToEmail,
    notifyPassportExpiry: row.notifyPassportExpiry,
    notifyPaymentDue: row.notifyPaymentDue,
    notifyDailySummary: row.notifyDailySummary,
    notifyQuotationExpiry: row.notifyQuotationExpiry,
    notifyOverdueTasks: row.notifyOverdueTasks,
    passportExpiryWarnDays: row.passportExpiryWarnDays,
    paymentDueWarnDays: row.paymentDueWarnDays,
    quotationExpiryWarnDays: row.quotationExpiryWarnDays,
    overdueTaskWarnDays: row.overdueTaskWarnDays,
    updatedAt: row.updatedAt,
  };
}

/** Notification toggles + lead-time windows used by the cron sweeps. */
export interface NotificationConfig {
  notifyPassportExpiry: boolean;
  notifyPaymentDue: boolean;
  notifyOverdueTasks: boolean;
  passportExpiryWarnDays: number;
  paymentDueWarnDays: number;
  overdueTaskWarnDays: number;
}

/**
 * Internal, permission-free read of notification config for SYSTEM cron sweeps.
 * Not a user-facing action.
 */
export async function getNotificationConfig(): Promise<NotificationConfig> {
  const row = await repo.get();
  return {
    notifyPassportExpiry: row?.notifyPassportExpiry ?? DEFAULTS.notifyPassportExpiry,
    notifyPaymentDue: row?.notifyPaymentDue ?? DEFAULTS.notifyPaymentDue,
    notifyOverdueTasks: row?.notifyOverdueTasks ?? DEFAULTS.notifyOverdueTasks,
    passportExpiryWarnDays: row?.passportExpiryWarnDays ?? DEFAULTS.passportExpiryWarnDays,
    paymentDueWarnDays: row?.paymentDueWarnDays ?? DEFAULTS.paymentDueWarnDays,
    overdueTaskWarnDays: row?.overdueTaskWarnDays ?? DEFAULTS.overdueTaskWarnDays,
  };
}

export async function getSettings(user: UserContext): Promise<SettingsDTO> {
  requirePermission(user, "settings:view");
  const row = await repo.get();
  return row ? toDTO(row) : DEFAULTS;
}

/** Agency profile fields needed to render quotation / invoice documents. */
export interface AgencyProfile {
  agencyName: string;
  agencyAddress: string | null;
  agencyPhone: string | null;
  agencyEmail: string | null;
  agencyWebsite: string | null;
  taxRegistrationNo: string | null;
  defaultTaxBps: number;
  quoteValidDays: number;
}

/**
 * Internal, permission-free read of the agency profile for SYSTEM document
 * rendering (quotation / invoice PDFs and outbox emails). This is not a
 * user-facing action — never expose it through a server action.
 */
export async function getAgencyProfile(): Promise<AgencyProfile> {
  const row = await repo.get();
  return {
    agencyName: row?.agencyName ?? DEFAULTS.agencyName,
    agencyAddress: row?.agencyAddress ?? null,
    agencyPhone: row?.agencyPhone ?? null,
    agencyEmail: row?.agencyEmail ?? null,
    agencyWebsite: row?.agencyWebsite ?? null,
    taxRegistrationNo: row?.taxRegistrationNo ?? null,
    defaultTaxBps: row?.defaultTaxBps ?? 0,
    quoteValidDays: row?.quoteValidDays ?? DEFAULTS.quoteValidDays,
  };
}

function auditedUpdate(
  user: UserContext,
  action: string,
  before: SettingsDTO,
  data: repo.SettingsWriteData,
): Promise<SettingsDTO> {
  return withAudit(
    {
      actorId: user.id,
      action,
      entity: "Settings",
      before,
      ip: user.ip,
      userAgent: user.userAgent,
      entityIdFromResult: () => "singleton",
    },
    async (tx) => toDTO(await repo.upsert(data, tx)),
  );
}

export async function updateAgency(
  user: UserContext,
  input: UpdateAgencyInput,
): Promise<SettingsDTO> {
  requirePermission(user, "settings:update");
  const before = await getSettings(user);
  return auditedUpdate(user, "settings.agency_update", before, {
    agencyName: input.agencyName,
    agencyPhone: input.agencyPhone ?? null,
    agencyEmail: input.agencyEmail ?? null,
    agencyAddress: input.agencyAddress ?? null,
    agencyWebsite: input.agencyWebsite ?? null,
    defaultTaxBps: Math.round(input.taxPercentage * 100),
    defaultCurrency: input.defaultCurrency,
    defaultTimezone: input.defaultTimezone,
  });
}

export async function updateEmail(
  user: UserContext,
  input: UpdateEmailInput,
): Promise<SettingsDTO> {
  requirePermission(user, "settings:update");
  const before = await getSettings(user);
  return auditedUpdate(user, "settings.email_update", before, {
    senderName: input.senderName ?? null,
    senderEmail: input.senderEmail ?? null,
    replyToEmail: input.replyToEmail ?? null,
  });
}

export async function updateNotifications(
  user: UserContext,
  input: UpdateNotificationsInput,
): Promise<SettingsDTO> {
  requirePermission(user, "settings:update");
  const before = await getSettings(user);
  return auditedUpdate(user, "settings.notifications_update", before, {
    notifyPassportExpiry: input.notifyPassportExpiry,
    notifyPaymentDue: input.notifyPaymentDue,
    notifyDailySummary: input.notifyDailySummary,
    notifyQuotationExpiry: input.notifyQuotationExpiry,
    notifyOverdueTasks: input.notifyOverdueTasks,
    passportExpiryWarnDays: input.passportExpiryWarnDays,
    paymentDueWarnDays: input.paymentDueWarnDays,
    quotationExpiryWarnDays: input.quotationExpiryWarnDays,
    overdueTaskWarnDays: input.overdueTaskWarnDays,
  });
}

/**
 * Send a one-off test email via Resend using the configured sender. This is an
 * explicit admin action (not a transactional side-effect), so it sends directly
 * rather than through the outbox.
 */
export async function sendTestEmail(
  user: UserContext,
  input: TestEmailInput,
): Promise<{ sent: true; to: string }> {
  requirePermission(user, "settings:update");

  const row = await repo.get();
  const from = row?.senderEmail ?? env.EMAIL_FROM;
  if (!env.RESEND_API_KEY || !from) {
    throw new IntegrationError(
      "Email is not configured. Set RESEND_API_KEY and a sender email first.",
    );
  }

  const to = input.to ?? user.email;
  const resend = new Resend(env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: row?.senderName ? `${row.senderName} <${from}>` : from,
    to,
    subject: "Safar CRM — test email",
    html: "<p>This is a test email from your Safar CRM email settings. If you received it, your sender configuration works.</p>",
    ...(row?.replyToEmail ? { replyTo: row.replyToEmail } : {}),
  });

  if (error) {
    throw new IntegrationError("Failed to send the test email — check your Resend configuration.");
  }
  return { sent: true, to };
}
