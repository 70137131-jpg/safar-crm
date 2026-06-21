import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Settings repository — pure data access for the agency-wide singleton.
 * No business logic, no audit, no email.
 */

const SINGLETON_ID = "singleton";

type TxClient = typeof db | Prisma.TransactionClient;

/** Scalar columns the service is allowed to write. */
export interface SettingsWriteData {
  agencyName?: string;
  agencyPhone?: string | null;
  agencyEmail?: string | null;
  agencyAddress?: string | null;
  agencyWebsite?: string | null;
  agencyLogoKey?: string | null;
  defaultTaxBps?: number;
  defaultCurrency?: string;
  defaultTimezone?: string;
  leadSources?: string[];
  senderName?: string | null;
  senderEmail?: string | null;
  replyToEmail?: string | null;
  notifyPassportExpiry?: boolean;
  notifyPaymentDue?: boolean;
  notifyDailySummary?: boolean;
  notifyQuotationExpiry?: boolean;
  notifyOverdueTasks?: boolean;
  passportExpiryWarnDays?: number;
  paymentDueWarnDays?: number;
  quotationExpiryWarnDays?: number;
  overdueTaskWarnDays?: number;
}

export async function get() {
  return db.settings.findUnique({ where: { id: SINGLETON_ID } });
}

/** Upsert the singleton — creates it with a fallback name on first write. */
export async function upsert(data: SettingsWriteData, tx: TxClient = db) {
  return tx.settings.upsert({
    where: { id: SINGLETON_ID },
    update: data,
    create: { id: SINGLETON_ID, agencyName: data.agencyName ?? "Safar CRM", ...data },
  });
}
