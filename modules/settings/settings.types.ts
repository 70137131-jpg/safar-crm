/**
 * Settings DTO returned by the settings service. `taxPercentage` is derived
 * from the stored `defaultTaxBps` (basis points) so the UI works in percent.
 */
export interface SettingsDTO {
  agencyName: string;
  agencyPhone: string | null;
  agencyEmail: string | null;
  agencyAddress: string | null;
  agencyWebsite: string | null;
  agencyLogoKey: string | null;
  taxPercentage: number;
  defaultCurrency: string;
  defaultTimezone: string;
  leadSources: string[];
  quoteValidDays: number;

  senderName: string | null;
  senderEmail: string | null;
  replyToEmail: string | null;

  notifyPassportExpiry: boolean;
  notifyPaymentDue: boolean;
  notifyDailySummary: boolean;
  notifyQuotationExpiry: boolean;
  notifyOverdueTasks: boolean;
  passportExpiryWarnDays: number;
  paymentDueWarnDays: number;
  quotationExpiryWarnDays: number;
  overdueTaskWarnDays: number;

  updatedAt: Date | null;
}
