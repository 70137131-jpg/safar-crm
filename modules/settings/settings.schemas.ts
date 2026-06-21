import { z } from "zod";

/**
 * Settings Zod schemas. The Settings singleton stores agency profile, email
 * sender identity and notification preferences. Currency is PKR-only in v1.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v));

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .email("Invalid email address")
  .max(254)
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v));

const optionalUrl = z
  .string()
  .trim()
  .url("Must be a valid URL")
  .max(2048)
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v));

const warnDays = z.coerce.number().int().min(0).max(365);

export const updateAgencySchema = z.object({
  agencyName: z.string().trim().min(1, "Agency name is required").max(200),
  agencyPhone: optionalText(40),
  agencyEmail: optionalEmail,
  agencyAddress: optionalText(500),
  agencyWebsite: optionalUrl,
  taxPercentage: z.coerce.number().min(0, "Cannot be negative").max(100, "Cannot exceed 100%"),
  defaultCurrency: z.literal("PKR").default("PKR"),
  defaultTimezone: z.string().trim().min(1).default("Asia/Karachi"),
});
export type UpdateAgencyInput = z.infer<typeof updateAgencySchema>;

export const updateEmailSchema = z.object({
  senderName: optionalText(120),
  senderEmail: optionalEmail,
  replyToEmail: optionalEmail,
});
export type UpdateEmailInput = z.infer<typeof updateEmailSchema>;

export const updateNotificationsSchema = z.object({
  notifyPassportExpiry: z.boolean(),
  notifyPaymentDue: z.boolean(),
  notifyDailySummary: z.boolean(),
  notifyQuotationExpiry: z.boolean(),
  notifyOverdueTasks: z.boolean(),
  passportExpiryWarnDays: warnDays,
  paymentDueWarnDays: warnDays,
  quotationExpiryWarnDays: warnDays,
  overdueTaskWarnDays: warnDays,
});
export type UpdateNotificationsInput = z.infer<typeof updateNotificationsSchema>;

/** Caps for the lead-source list editor. */
export const MAX_LEAD_SOURCES = 50;
export const MAX_LEAD_SOURCE_LENGTH = 60;

export const updateLeadSourcesSchema = z.object({
  // Accept the raw list, then normalise server-side: trim, drop blanks,
  // dedupe case-insensitively (keeping the first spelling), cap the count.
  leadSources: z
    .array(z.string().trim().max(MAX_LEAD_SOURCE_LENGTH, `Each source must be ${MAX_LEAD_SOURCE_LENGTH} characters or fewer`))
    .max(200, "Too many lead sources")
    .transform((arr) => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const raw of arr) {
        const value = raw.trim();
        if (!value) continue;
        const key = value.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(value);
      }
      return out.slice(0, MAX_LEAD_SOURCES);
    }),
});
export type UpdateLeadSourcesInput = z.infer<typeof updateLeadSourcesSchema>;

export const testEmailSchema = z.object({
  to: optionalEmail,
});
export type TestEmailInput = z.infer<typeof testEmailSchema>;
