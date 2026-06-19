-- Settings + Users administration module.
-- Adds the first-login flag to User and agency / email / notification config to
-- the Settings singleton.

-- User: require-password-change-on-first-login flag.
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- Settings: agency profile.
ALTER TABLE "Settings" ADD COLUMN "agencyWebsite" TEXT;
ALTER TABLE "Settings" ADD COLUMN "defaultCurrency" TEXT NOT NULL DEFAULT 'PKR';
ALTER TABLE "Settings" ADD COLUMN "defaultTimezone" TEXT NOT NULL DEFAULT 'Asia/Karachi';

-- Settings: email (Resend) sender identity.
ALTER TABLE "Settings" ADD COLUMN "senderName" TEXT;
ALTER TABLE "Settings" ADD COLUMN "senderEmail" TEXT;
ALTER TABLE "Settings" ADD COLUMN "replyToEmail" TEXT;

-- Settings: notification toggles + lead times (days before).
ALTER TABLE "Settings" ADD COLUMN "notifyPassportExpiry" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Settings" ADD COLUMN "notifyPaymentDue" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Settings" ADD COLUMN "notifyDailySummary" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Settings" ADD COLUMN "notifyQuotationExpiry" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Settings" ADD COLUMN "notifyOverdueTasks" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Settings" ADD COLUMN "paymentDueWarnDays" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "Settings" ADD COLUMN "quotationExpiryWarnDays" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "Settings" ADD COLUMN "overdueTaskWarnDays" INTEGER NOT NULL DEFAULT 1;

-- v1 is PKR-only (ARCHITECTURE.md / product rule).
ALTER TABLE "Settings" ADD CONSTRAINT "settings_currency_pkr" CHECK ("defaultCurrency" = 'PKR');
