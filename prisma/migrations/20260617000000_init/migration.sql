-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MANAGER', 'AGENT', 'ACCOUNTANT');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUOTATION_SENT', 'NEGOTIATING', 'BOOKED', 'TRAVELLED', 'LOST');

-- CreateEnum
CREATE TYPE "TripPurpose" AS ENUM ('UMRAH', 'HAJJ', 'LEISURE_TOUR', 'BUSINESS', 'FAMILY_VISIT', 'EDUCATION', 'MEDICAL', 'OTHER');

-- CreateEnum
CREATE TYPE "RouteShape" AS ENUM ('ONE_WAY', 'ROUND_TRIP', 'MULTI_CITY');

-- CreateEnum
CREATE TYPE "LostReason" AS ENUM ('PRICE', 'COMPETITOR', 'NO_RESPONSE', 'CHANGED_PLANS', 'NO_VISA', 'OTHER');

-- CreateEnum
CREATE TYPE "InteractionType" AS ENUM ('CALL', 'WHATSAPP', 'EMAIL', 'MEETING', 'NOTE');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'DONE');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('FOLLOW_UP', 'PASSPORT_EXPIRY', 'PAYMENT_DUE', 'OTHER');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'TICKETED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CancelReason" AS ENUM ('CUSTOMER_REQUEST', 'NO_PAYMENT', 'SUPPLIER_ISSUE', 'FORCE_MAJEURE', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PAID', 'VOIDED');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('PASSPORT', 'VISA', 'TICKET', 'INVOICE', 'VOUCHER', 'OTHER');

-- CreateEnum
CREATE TYPE "PackageStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "avatar" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'AGENT',
    "deactivatedAt" TIMESTAMPTZ(6),
    "deactivatedById" UUID,
    "lastLoginAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "token" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMPTZ(6),
    "refreshTokenExpiresAt" TIMESTAMPTZ(6),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" CITEXT,
    "phone" TEXT,
    "nationality" VARCHAR(2),
    "passportNo" TEXT,
    "passportExpiry" DATE,
    "dob" DATE,
    "address" TEXT,
    "notes" TEXT,
    "assignedAgentId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" UUID NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "contactEmail" CITEXT,
    "customerId" UUID,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "source" TEXT,
    "assignedAgentId" UUID,
    "destination" TEXT,
    "tripPurpose" "TripPurpose",
    "routeShape" "RouteShape",
    "pax" SMALLINT,
    "budgetPaisa" BIGINT,
    "travelDate" DATE,
    "lostReason" "LostReason",
    "lostNotes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interaction" (
    "id" UUID NOT NULL,
    "leadId" UUID,
    "customerId" UUID,
    "type" "InteractionType" NOT NULL,
    "body" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Interaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" TIMESTAMPTZ(6) NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "type" "TaskType" NOT NULL,
    "leadId" UUID,
    "customerId" UUID,
    "bookingId" UUID,
    "assignedToId" UUID NOT NULL,
    "reminderSentAt" TIMESTAMPTZ(6),
    "reminderEmailMessageId" TEXT,
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "doneAt" TIMESTAMPTZ(6),
    "doneById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" UUID NOT NULL,
    "bookingNumber" TEXT NOT NULL,
    "customerId" UUID NOT NULL,
    "leadId" UUID,
    "packageId" UUID,
    "packageSnapshot" JSONB,
    "travelDate" DATE,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "totalPricePaisa" BIGINT NOT NULL,
    "notes" TEXT,
    "confirmedAt" TIMESTAMPTZ(6),
    "ticketedAt" TIMESTAMPTZ(6),
    "completedAt" TIMESTAMPTZ(6),
    "cancelReason" "CancelReason",
    "cancelNotes" TEXT,
    "cancelledAt" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "amountPaisa" BIGINT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PAID',
    "reference" TEXT,
    "paidAt" TIMESTAMPTZ(6),
    "recordedById" UUID NOT NULL,
    "idempotencyKey" TEXT,
    "notes" TEXT,
    "voidedAt" TIMESTAMPTZ(6),
    "voidedById" UUID,
    "voidReason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" UUID NOT NULL,
    "quoteNumber" TEXT,
    "customerId" UUID,
    "leadId" UUID,
    "validTill" DATE,
    "subtotalPaisa" BIGINT NOT NULL DEFAULT 0,
    "taxPaisa" BIGINT NOT NULL DEFAULT 0,
    "discountPaisa" BIGINT NOT NULL DEFAULT 0,
    "totalPaisa" BIGINT NOT NULL DEFAULT 0,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "pdfFileKey" TEXT,
    "sentAt" TIMESTAMPTZ(6),
    "issuedAt" TIMESTAMPTZ(6),
    "acceptedAt" TIMESTAMPTZ(6),
    "expiredAt" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationItem" (
    "id" UUID NOT NULL,
    "quotationId" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" SMALLINT NOT NULL DEFAULT 1,
    "unitPricePaisa" BIGINT NOT NULL,
    "linePaisa" BIGINT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "QuotationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "bookingId" UUID NOT NULL,
    "amountPaisa" BIGINT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "issuedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMPTZ(6),
    "cancelledAt" TIMESTAMPTZ(6),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "customerId" UUID,
    "bookingId" UUID,
    "type" "DocumentType" NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "expiryDate" DATE,
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadStatusEvent" (
    "id" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "fromStatus" "LeadStatus",
    "toStatus" "LeadStatus" NOT NULL,
    "reason" TEXT,
    "byUserId" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingStatusEvent" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "fromStatus" "BookingStatus",
    "toStatus" "BookingStatus" NOT NULL,
    "reason" TEXT,
    "byUserId" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "agencyName" TEXT NOT NULL,
    "agencyAddress" TEXT,
    "agencyPhone" TEXT,
    "agencyEmail" CITEXT,
    "agencyLogoKey" TEXT,
    "taxRegistrationNo" TEXT,
    "leadSources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "defaultTaxBps" INTEGER NOT NULL DEFAULT 0,
    "quoteValidDays" INTEGER NOT NULL DEFAULT 14,
    "passportExpiryWarnDays" INTEGER NOT NULL DEFAULT 180,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Package" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "description" TEXT,
    "durationDays" SMALLINT NOT NULL,
    "pricePaisa" BIGINT NOT NULL,
    "hotel" TEXT,
    "included" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excluded" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "PackageStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Customer_assignedAgentId_idx" ON "Customer"("assignedAgentId");

-- CreateIndex
CREATE INDEX "Customer_passportExpiry_idx" ON "Customer"("passportExpiry");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "Lead_customerId_idx" ON "Lead"("customerId");

-- CreateIndex
CREATE INDEX "Lead_assignedAgentId_idx" ON "Lead"("assignedAgentId");

-- CreateIndex
CREATE INDEX "Lead_travelDate_idx" ON "Lead"("travelDate");

-- CreateIndex
CREATE INDEX "Lead_assignedAgentId_status_idx" ON "Lead"("assignedAgentId", "status");

-- CreateIndex
CREATE INDEX "Lead_assignedAgentId_status_updatedAt_idx" ON "Lead"("assignedAgentId", "status", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "Interaction_leadId_idx" ON "Interaction"("leadId");

-- CreateIndex
CREATE INDEX "Interaction_customerId_idx" ON "Interaction"("customerId");

-- CreateIndex
CREATE INDEX "Interaction_createdById_idx" ON "Interaction"("createdById");

-- CreateIndex
CREATE INDEX "Interaction_occurredAt_idx" ON "Interaction"("occurredAt");

-- CreateIndex
CREATE INDEX "Interaction_leadId_occurredAt_idx" ON "Interaction"("leadId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "Interaction_customerId_occurredAt_idx" ON "Interaction"("customerId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "Task_leadId_idx" ON "Task"("leadId");

-- CreateIndex
CREATE INDEX "Task_customerId_idx" ON "Task"("customerId");

-- CreateIndex
CREATE INDEX "Task_bookingId_idx" ON "Task"("bookingId");

-- CreateIndex
CREATE INDEX "Task_assignedToId_idx" ON "Task"("assignedToId");

-- CreateIndex
CREATE INDEX "Task_dueDate_idx" ON "Task"("dueDate");

-- CreateIndex
CREATE INDEX "Task_assignedToId_status_dueDate_idx" ON "Task"("assignedToId", "status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_bookingNumber_key" ON "Booking"("bookingNumber");

-- CreateIndex
CREATE INDEX "Booking_customerId_idx" ON "Booking"("customerId");

-- CreateIndex
CREATE INDEX "Booking_leadId_idx" ON "Booking"("leadId");

-- CreateIndex
CREATE INDEX "Booking_packageId_idx" ON "Booking"("packageId");

-- CreateIndex
CREATE INDEX "Booking_travelDate_idx" ON "Booking"("travelDate");

-- CreateIndex
CREATE INDEX "Booking_customerId_status_idx" ON "Booking"("customerId", "status");

-- CreateIndex
CREATE INDEX "Payment_bookingId_idx" ON "Payment"("bookingId");

-- CreateIndex
CREATE INDEX "Payment_recordedById_idx" ON "Payment"("recordedById");

-- CreateIndex
CREATE INDEX "Payment_paidAt_idx" ON "Payment"("paidAt");

-- CreateIndex
CREATE INDEX "Payment_bookingId_status_idx" ON "Payment"("bookingId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_quoteNumber_key" ON "Quotation"("quoteNumber");

-- CreateIndex
CREATE INDEX "Quotation_customerId_idx" ON "Quotation"("customerId");

-- CreateIndex
CREATE INDEX "Quotation_leadId_idx" ON "Quotation"("leadId");

-- CreateIndex
CREATE INDEX "Quotation_validTill_idx" ON "Quotation"("validTill");

-- CreateIndex
CREATE INDEX "Quotation_sentAt_idx" ON "Quotation"("sentAt");

-- CreateIndex
CREATE INDEX "QuotationItem_quotationId_idx" ON "QuotationItem"("quotationId");

-- CreateIndex
CREATE UNIQUE INDEX "QuotationItem_quotationId_position_key" ON "QuotationItem"("quotationId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_bookingId_idx" ON "Invoice"("bookingId");

-- CreateIndex
CREATE INDEX "Invoice_issuedAt_idx" ON "Invoice"("issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Document_fileKey_key" ON "Document"("fileKey");

-- CreateIndex
CREATE INDEX "Document_customerId_idx" ON "Document"("customerId");

-- CreateIndex
CREATE INDEX "Document_bookingId_idx" ON "Document"("bookingId");

-- CreateIndex
CREATE INDEX "Document_uploadedById_idx" ON "Document"("uploadedById");

-- CreateIndex
CREATE INDEX "Document_expiryDate_idx" ON "Document"("expiryDate");

-- CreateIndex
CREATE INDEX "Document_customerId_type_idx" ON "Document"("customerId", "type");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_createdAt_idx" ON "AuditLog"("entity", "entityId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "LeadStatusEvent_leadId_occurredAt_idx" ON "LeadStatusEvent"("leadId", "occurredAt");

-- CreateIndex
CREATE INDEX "LeadStatusEvent_byUserId_idx" ON "LeadStatusEvent"("byUserId");

-- CreateIndex
CREATE INDEX "BookingStatusEvent_bookingId_occurredAt_idx" ON "BookingStatusEvent"("bookingId", "occurredAt");

-- CreateIndex
CREATE INDEX "BookingStatusEvent_byUserId_idx" ON "BookingStatusEvent"("byUserId");

-- CreateIndex
CREATE INDEX "Package_destination_idx" ON "Package"("destination");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_deactivatedById_fkey" FOREIGN KEY ("deactivatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadStatusEvent" ADD CONSTRAINT "LeadStatusEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadStatusEvent" ADD CONSTRAINT "LeadStatusEvent_byUserId_fkey" FOREIGN KEY ("byUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingStatusEvent" ADD CONSTRAINT "BookingStatusEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingStatusEvent" ADD CONSTRAINT "BookingStatusEvent_byUserId_fkey" FOREIGN KEY ("byUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- =============================================================================
-- Raw-SQL layer: CHECK constraints, partial unique indexes, sequences,
-- triggers, and append-only grants that cannot be expressed in the Prisma
-- schema language. Mirrors the "RAW MIGRATIONS" comments in prisma/schema.prisma
-- — keep the two in sync.
-- =============================================================================

-- ── Customer ────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "customer_email_active_uq"
  ON "Customer" (email) WHERE "deletedAt" IS NULL AND email IS NOT NULL;
CREATE UNIQUE INDEX "customer_phone_active_uq"
  ON "Customer" (phone) WHERE "deletedAt" IS NULL AND phone IS NOT NULL;
CREATE INDEX "customer_deleted_idx"
  ON "Customer" ("deletedAt") WHERE "deletedAt" IS NOT NULL;
ALTER TABLE "Customer" ADD CONSTRAINT "customer_nationality_iso"
  CHECK (nationality IS NULL OR nationality ~ '^[A-Z]{2}$');
ALTER TABLE "Customer" ADD CONSTRAINT "customer_passport_format"
  CHECK ("passportNo" IS NULL OR "passportNo" ~ '^[A-Z0-9]{6,12}$');

-- ── Lead ────────────────────────────────────────────────────────────────────
ALTER TABLE "Lead" ADD CONSTRAINT "lead_pax_positive"
  CHECK (pax IS NULL OR pax > 0);
ALTER TABLE "Lead" ADD CONSTRAINT "lead_budget_nonneg"
  CHECK ("budgetPaisa" IS NULL OR "budgetPaisa" >= 0);
ALTER TABLE "Lead" ADD CONSTRAINT "lead_lost_reason_when_lost"
  CHECK ((status <> 'LOST') OR (status = 'LOST' AND "lostReason" IS NOT NULL));
CREATE INDEX "lead_deleted_idx"
  ON "Lead" ("deletedAt") WHERE "deletedAt" IS NOT NULL;

-- ── Interaction ─────────────────────────────────────────────────────────────
ALTER TABLE "Interaction" ADD CONSTRAINT "interaction_exactly_one_parent"
  CHECK ((("leadId" IS NOT NULL)::int + ("customerId" IS NOT NULL)::int) = 1);
ALTER TABLE "Interaction" ADD CONSTRAINT "interaction_body_cap"
  CHECK (length(body) <= 20000);

-- ── Task ────────────────────────────────────────────────────────────────────
ALTER TABLE "Task" ADD CONSTRAINT "task_has_parent"
  CHECK ((("leadId" IS NOT NULL)::int + ("customerId" IS NOT NULL)::int + ("bookingId" IS NOT NULL)::int) >= 1);
ALTER TABLE "Task" ADD CONSTRAINT "task_done_consistency"
  CHECK ((status = 'DONE' AND "doneAt" IS NOT NULL) OR (status = 'OPEN' AND "doneAt" IS NULL));
CREATE UNIQUE INDEX "task_passport_expiry_open_uq"
  ON "Task" ("customerId") WHERE type = 'PASSPORT_EXPIRY' AND status = 'OPEN' AND "customerId" IS NOT NULL;
CREATE UNIQUE INDEX "task_payment_due_open_uq"
  ON "Task" ("bookingId") WHERE type = 'PAYMENT_DUE' AND status = 'OPEN' AND "bookingId" IS NOT NULL;

-- ── Booking ─────────────────────────────────────────────────────────────────
ALTER TABLE "Booking" ADD CONSTRAINT "booking_total_nonneg"
  CHECK ("totalPricePaisa" >= 0);
ALTER TABLE "Booking" ADD CONSTRAINT "booking_cancel_consistency"
  CHECK ((status = 'CANCELLED' AND "cancelledAt" IS NOT NULL AND "cancelReason" IS NOT NULL)
      OR (status <> 'CANCELLED' AND "cancelledAt" IS NULL));
CREATE SEQUENCE IF NOT EXISTS "booking_number_seq" START 1;
CREATE INDEX "booking_deleted_idx"
  ON "Booking" ("deletedAt") WHERE "deletedAt" IS NOT NULL;

-- ── Payment ─────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "payment_idempotency_uq"
  ON "Payment" ("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;
ALTER TABLE "Payment" ADD CONSTRAINT "payment_voided_consistency"
  CHECK ((status = 'VOIDED' AND "voidedAt" IS NOT NULL)
      OR (status = 'PAID'   AND "voidedAt" IS NULL));

-- ── Quotation ───────────────────────────────────────────────────────────────
ALTER TABLE "Quotation" ADD CONSTRAINT "quotation_has_target"
  CHECK ((("customerId" IS NOT NULL)::int + ("leadId" IS NOT NULL)::int) >= 1);
ALTER TABLE "Quotation" ADD CONSTRAINT "quotation_totals_nonneg"
  CHECK ("subtotalPaisa" >= 0 AND "taxPaisa" >= 0 AND "discountPaisa" >= 0 AND "totalPaisa" >= 0);
ALTER TABLE "Quotation" ADD CONSTRAINT "quotation_number_when_sent"
  CHECK ((status = 'DRAFT' AND "quoteNumber" IS NULL)
      OR (status <> 'DRAFT' AND "quoteNumber" IS NOT NULL));
CREATE SEQUENCE IF NOT EXISTS "quote_number_seq" START 1;

-- Freeze totals once the quote leaves DRAFT.
CREATE OR REPLACE FUNCTION lock_quotation_totals() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status <> 'DRAFT' AND (
    NEW."subtotalPaisa" IS DISTINCT FROM OLD."subtotalPaisa" OR
    NEW."taxPaisa"      IS DISTINCT FROM OLD."taxPaisa"      OR
    NEW."discountPaisa" IS DISTINCT FROM OLD."discountPaisa" OR
    NEW."totalPaisa"    IS DISTINCT FROM OLD."totalPaisa"
  ) THEN
    RAISE EXCEPTION 'Quotation totals are immutable after leaving DRAFT';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER quotation_lock_totals
  BEFORE UPDATE ON "Quotation" FOR EACH ROW EXECUTE FUNCTION lock_quotation_totals();

-- ── QuotationItem ───────────────────────────────────────────────────────────
ALTER TABLE "QuotationItem" ADD CONSTRAINT "quotation_item_amounts"
  CHECK (quantity > 0 AND "unitPricePaisa" >= 0
         AND "linePaisa" = "quantity" * "unitPricePaisa");

-- ── Invoice ─────────────────────────────────────────────────────────────────
ALTER TABLE "Invoice" ADD CONSTRAINT "invoice_amount_nonneg"
  CHECK ("amountPaisa" >= 0);
CREATE SEQUENCE IF NOT EXISTS "invoice_number_seq" START 1;

-- ── Document ────────────────────────────────────────────────────────────────
ALTER TABLE "Document" ADD CONSTRAINT "document_has_parent"
  CHECK ((("customerId" IS NOT NULL)::int + ("bookingId" IS NOT NULL)::int) >= 1);
ALTER TABLE "Document" ADD CONSTRAINT "document_denorm_customer"
  CHECK ("bookingId" IS NULL OR "customerId" IS NOT NULL);
ALTER TABLE "Document" ADD CONSTRAINT "document_size_nonneg"
  CHECK ("sizeBytes" >= 0);
ALTER TABLE "Document" ADD CONSTRAINT "document_checksum_format"
  CHECK ("checksumSha256" ~ '^[a-f0-9]{64}$');

-- ── AuditLog (append-only) ──────────────────────────────────────────────────
CREATE INDEX "audit_log_created_brin" ON "AuditLog" USING BRIN ("createdAt");
-- Append-only enforcement at the DB-role level. Guarded so a fresh database
-- without the application role still migrates cleanly; the `crm_app` role is
-- provisioned out-of-band (see runbook / TASKS.md §0.7).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crm_app') THEN
    REVOKE UPDATE, DELETE ON "AuditLog" FROM crm_app;
    GRANT INSERT, SELECT ON "AuditLog" TO crm_app;
  END IF;
END $$;

-- ── Settings ────────────────────────────────────────────────────────────────
ALTER TABLE "Settings" ADD CONSTRAINT "settings_singleton" CHECK (id = 'singleton');

-- ── Package ─────────────────────────────────────────────────────────────────
ALTER TABLE "Package" ADD CONSTRAINT "package_duration_pos"
  CHECK ("durationDays" > 0);
ALTER TABLE "Package" ADD CONSTRAINT "package_price_nonneg"
  CHECK ("pricePaisa" >= 0);
