# Safar CRM AI Features

This document describes the AI enhancement implementation on
`feat/ai-crm-enhancements`.

## Product Surfaces

- `/assistant` — Ask Safar conversational copilot with CRM tools.
- `/ai-insights` — AI Workspace for focused, explainable workflows.
- Lead detail — opens scoring and package recommendations with the lead selected.
- Customer detail — opens the multilingual follow-up composer with the customer selected.
- Quotation detail — opens deterministic quote quality review with the quotation selected.
- Document panels — open extraction or audio analysis with the document selected.
- Notification bell — surfaces lead, document, payment, data-quality, forecast, and briefing alerts.

## Implemented Capabilities

### Follow-up Composer

- WhatsApp and email drafts.
- English, Urdu, and Roman Urdu.
- Configurable tone and purpose.
- Uses bounded, permission-scoped lead or customer context.
- Stores an editable draft.
- Never sends a message.
- Uses a deterministic template if Gemini is not configured.

### Explainable Lead Scoring

- Produces a 0–100 score, confidence, priority, evidence, and next action.
- Uses stage, budget, destination, recent interactions, quotations, tasks, and travel proximity.
- Arithmetic and thresholds are deterministic and unit tested.
- Never changes lead status.

### Document Extraction

- Processes authorized PDF, JPEG, or PNG documents from private R2 storage.
- Extracts typed field values, evidence, confidence, and warnings with Gemini.
- Stores a pending review.
- Accept/reject records the review decision but never overwrites the CRM customer.
- Model outputs pass through Zod validation.

### Semantic CRM Search

- Uses `pgvector` with 768-dimension Gemini embeddings.
- Stores a separate search snapshot per user.
- Index creation is permission-scoped before any text is embedded.
- Sensitive identifier, email, and phone patterns are removed from indexed text.
- HNSW cosine index is installed by the migration.
- Ask Safar can query the same isolated index.

### Daily Briefing and Notifications

- Generates daily briefing insights.
- Identifies priority leads, overdue tasks, and expiring quotations.
- Detects documents expiring inside the configured window.
- Detects outstanding booking balances before travel.
- Runs an authenticated scheduled refresh from `/api/cron/refresh-ai-insights`.
- Uses dedupe keys so refreshes are idempotent.

### Voice-note and Call Intelligence

- Accepts audio documents stored in private R2.
- Supports MP3, M4A/MP4, WAV, WebM, and OGG.
- Produces transcript, summary, sentiment, speakers, commitments, objections, and action items.
- Creates confirmation-gated proposals for a customer interaction and follow-up tasks.
- Nothing is written to operational CRM records until a staff member confirms.

### Package Recommender

- Ranks active package inventory.
- Uses destination and budget fit, with smaller completeness signals.
- Returns verified CRM prices and inventory fields.
- Does not invent packages, prices, or availability.

### Quotation Quality Checker

- Checks line/subtotal consistency.
- Checks total, tax, and discount arithmetic.
- Detects expired or missing validity.
- Flags duplicate line items and unusually large discounts.
- Provides a deterministic quality score and blocking status.

### Data-quality Assistant

- Detects missing contact methods, sources, destinations, and assignments.
- Detects stale tasks linked to terminal leads or cancelled bookings.
- Detects possible duplicate customers and leads inside the authorized record scope.
- Produces a review queue and notification.
- Never merges, deletes, or edits records automatically.

### Natural-language Reporting

- Maps a question to one approved report:
  `overview`, `revenue`, `lead-funnel`, `agent-performance`, `destination`,
  `lead-source`, `payments`, or `tasks`.
- Calls existing permission-aware report services.
- Does not expose SQL generation or raw database access.
- Falls back to deterministic intent classification when Gemini is unavailable.

### Forecasting and Anomaly Detection

- Forecasts three months of booked revenue.
- Uses transparent least-squares linear regression.
- Detects historical residuals more than two standard deviations from trend.
- Gemini never performs financial arithmetic.
- Monthly manager forecasts run through the scheduled refresh.

## Architecture

```text
CRM page / Ask Safar
        |
Authenticated API or server service
        |
RBAC and record ownership
        |
Bounded feature workflow
        |
Existing CRM services / typed reports / private storage
        |
Zod-validated result
        |
Insight, draft, review, proposal, or notification
```

The language model has no raw database access, unrestricted SQL, storage
credentials, general-purpose execution, or send capability.

## Data Model

The `20260729000000_ai_enhancements` migration adds:

- `AiInsight`
- `AiCommunicationDraft`
- `AiDocumentExtraction`
- `AiMediaAnalysis`
- `AiKnowledgeChunk`
- supporting enums and notification kinds
- PostgreSQL `vector` extension
- HNSW cosine index

## Configuration

Required for Gemini-backed features:

```dotenv
GEMINI_API_KEY="..."
GEMINI_MODEL="gemini-3.6-flash"
GEMINI_EMBEDDING_MODEL="gemini-embedding-001"
```

Document and audio processing also require the existing private R2 variables.

Apply the migration before using the AI Workspace:

```bash
pnpm prisma:deploy
```

The Neon database role used for migrations must be able to run:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

## Scheduled Refresh

Vercel invokes:

```text
GET /api/cron/refresh-ai-insights
Authorization: Bearer <CRON_SECRET>
```

The configured schedule is daily at `03:30 UTC`.

## Validation

Primary checks:

```bash
pnpm exec prisma validate
pnpm typecheck
pnpm lint
pnpm exec vitest run
pnpm build
```

Gemini and R2 integration tests require real credentials and should be run in a
non-production environment with synthetic CRM documents and recordings.
