# Safar CRM AI Enhancement Plan

> Implementation status: all roadmap capabilities have an initial implementation
> on `feat/ai-crm-enhancements`. See [AI_FEATURES.md](AI_FEATURES.md) for product
> surfaces, architecture, configuration, and validation.

## Goal

Extend Safar CRM's existing native copilot with focused, explainable AI features that improve sales productivity, customer follow-up, data quality, and management visibility.

The copilot should remain an internal CRM capability rather than becoming a separate agent platform. AI may analyze information, draft content, and propose actions, but consequential writes and communications must continue to require user confirmation.

## Priorities

| Priority | Feature                                       | Expected value                                            | Effort |
| -------- | --------------------------------------------- | --------------------------------------------------------- | ------ |
| 1        | AI follow-up composer                         | Faster and more consistent customer communication         | Low    |
| 2        | Explainable lead scoring and next-best action | Helps staff focus on likely conversions                   | Medium |
| 3        | Document extraction                           | Reduces passport, visa, invoice, and itinerary data entry | Medium |
| 4        | Semantic CRM search                           | Finds relevant information without exact keywords         | Medium |
| 5        | Manager daily briefing                        | Surfaces missed opportunities and operational risks       | Medium |
| 6        | Voice-note and call intelligence              | Converts conversations into CRM records and tasks         | Medium |
| 7        | Package and quote recommender                 | Matches customers with suitable travel products           | Medium |
| 8        | Forecasting and anomaly detection             | Improves revenue and workload planning                    | High   |

## 1. AI Follow-up Composer

Add a **Draft follow-up** action to lead and customer pages.

Capabilities:

- Draft WhatsApp messages and emails.
- Support English, Urdu, and Roman Urdu.
- Use the customer's destination, travel dates, quote, tasks, and previous interactions.
- Offer friendly, formal, urgent, payment-reminder, and re-engagement tones.
- Recommend an appropriate channel and follow-up time.
- Allow the user to edit the message before sending.
- Record the resulting interaction only after user approval.

The model must not send messages autonomously.

## 2. Explainable Lead Scoring and Next-Best Action

Give each open lead:

- A conversion probability.
- A low, medium, high, or urgent priority.
- A confidence level.
- Human-readable reasons for the score.
- A recommended next action.
- A suggested follow-up date.

Potential signals include:

- Reply and interaction activity.
- Quote creation or revision.
- Travel-date proximity.
- Budget and package fit.
- Previous bookings.
- Overdue tasks.
- Lead inactivity.

Store results as structured AI insight records so they can appear on lead pages, dashboards, manager briefings, and notifications. AI must not silently change a lead's status.

## 3. Document Extraction

Allow authorized users to upload passports, visa documents, invoices, flight itineraries, and hotel confirmations.

Extract:

- Passenger name and date of birth.
- Passport number, nationality, and expiry.
- Flight information.
- Hotel and booking information.
- Invoice totals and payment dates.
- Visa type and expiry.

Before saving, display an editable comparison:

```text
Existing value -> Extracted value -> Accept or reject
```

The model must never overwrite CRM data directly. Sensitive documents require restricted access, defined retention periods, and masked values in logs.

## 4. Semantic CRM Search

Enable meaning-based search over authorized CRM content, including leads, customer notes, interactions, quotes, tasks, and packages.

Example searches:

- "Customers interested in family Umrah packages for December."
- "Leads waiting for revised Dubai quotes."
- "Customers whose passports expire before travel."
- "Previous conversations mentioning wheelchair assistance."

Use PostgreSQL and `pgvector` for embeddings and vector retrieval. Apply CRM role, ownership, and organization filters to every retrieved result so similarity search can never bypass authorization.

## 5. Manager Daily Briefing and Smart Notifications

Enhance the existing notification system with a daily AI briefing that identifies:

- Leads likely to be lost.
- Missed follow-ups.
- Quotes approaching expiry.
- Customers waiting too long for a response.
- Overdue payments.
- Passport and visa expiry risks.
- Staff with unusually high workloads.
- Significant changes in conversion performance.

Every briefing item must explain why it was raised and link to the supporting CRM records.

## 6. Voice-note and Call Intelligence

Allow authorized staff to upload a call recording or WhatsApp voice note.

The AI should:

1. Transcribe the recording.
2. Identify speakers when possible.
3. Summarize customer requirements.
4. Detect objections, promises, and commitments.
5. Propose a CRM interaction.
6. Propose follow-up tasks.
7. Draft the next customer message.

Recording consent, access controls, and retention limits must be enforced. Saving interactions or tasks remains confirmation-gated.

## 7. Package and Quote Recommender

Recommend packages based on:

- Budget.
- Destination.
- Travel dates and duration.
- Number of adults and children.
- Hotel preference.
- Previous purchases.
- Visa requirements.
- Current CRM package inventory.

Use deterministic CRM filters to establish eligible packages, then use AI to rank and explain those results. Prices, availability, taxes, and visa rules must come from verified CRM data rather than model memory.

Add a quote quality checker that detects:

- Missing services.
- Inconsistent dates.
- Expired pricing.
- Low margins.
- Duplicate charges.
- Incomplete itineraries.

## 8. AI Data-quality Assistant

Create a review queue for:

- Potential duplicate leads and customers.
- Invalid or incomplete phone numbers.
- Contradictory travel dates.
- Missing lead sources.
- Customers without recent interactions.
- Tasks attached to completed leads.
- Duplicate passport or email information.

AI may propose corrections, but it must not automatically merge or delete records.

## 9. Natural-language Reporting

Let managers ask questions such as:

- "How many Umrah leads converted this month?"
- "Which salesperson has the best quote-to-booking rate?"
- "Why did Dubai conversions decline?"
- "Show unpaid bookings departing within 30 days."
- "Compare lead sources by revenue."

Do not give the model unrestricted SQL access. Implement typed reporting tools with approved dimensions, measures, filters, and date ranges. The AI should interpret the request, call those tools, and explain the returned data.

## 10. Forecasting and Anomaly Detection

Later phases may add models for:

- Monthly bookings.
- Expected cash collection.
- Lead volume.
- Staff workload.
- Cancellation risk.
- Seasonal destination demand.
- Unusual conversion or pricing changes.

Use statistical or machine-learning models for numerical predictions and Gemini for explanations. The language model should not independently calculate financial forecasts from unstructured text.

## Architecture

Maintain the existing safe execution path:

```text
CRM UI / Ask Safar
        |
Authenticated AI API
        |
RBAC, PII, and policy checks
        |
Typed CRM tools
        |
Existing service layer
        |
Prisma and PostgreSQL
```

Add five complementary AI components:

1. **Interactive copilot** for questions and user-requested actions.
2. **Event-driven insight workers** for lead, quote, task, payment, and interaction events.
3. **Permission-aware retrieval** for semantic search and grounded answers.
4. **Proposal and approval layer** for database writes, messages, merges, and other consequential actions.
5. **Evaluation and monitoring layer** for accuracy, safety, latency, reliability, and cost.

The model must never receive raw database access, unrestricted SQL, storage credentials, or general-purpose code execution. All actions must pass through narrowly scoped, typed tools and existing CRM services.

## Safety and Quality Requirements

- Apply RBAC and record-level authorization to every tool call and retrieval result.
- Require explicit confirmation for writes, customer communications, merges, and status changes.
- Include sources, supporting CRM records, confidence, and reasoning summaries where useful.
- Mask sensitive customer and document data in logs.
- Audit all model requests, tool calls, proposals, confirmations, and failures.
- Use idempotency keys to prevent duplicate actions.
- Expire stale proposals before execution.
- Version prompts, schemas, tools, and model configurations.
- Store structured outputs and business reasons, not hidden model reasoning.
- Maintain an evaluation set covering permissions, prompt injection, hallucinations, PII, tool selection, and multilingual output.
- Track feature-level latency, token usage, model cost, success rate, and user acceptance rate.
- Provide safe fallbacks when Gemini is unavailable.

## Delivery Roadmap

### Phase 1: Immediate Productivity

1. AI follow-up composer.
2. Explainable lead scoring and next-best action.
3. Improved manager briefings and notifications.
4. Automated AI evaluation suite.

### Phase 2: Knowledge and Automation

1. Document extraction with human review.
2. Permission-aware semantic CRM search.
3. Voice-note transcription, summaries, and proposed actions.
4. AI data-quality review queue.

### Phase 3: Decision Support

1. Package recommender.
2. Quote quality checker.
3. Natural-language reporting.
4. Forecasting and anomaly detection.

### Phase 4: Optional Real-time Experience

Add an internal push-to-talk voice copilot after the earlier features are stable. Treat real-time voice as optional and preserve the same authorization, tool, confirmation, and audit controls as the text copilot.

## Recommended Next Build

Start with:

1. AI follow-up composer.
2. Explainable lead scoring and next-best action.
3. Document extraction with human review.

Together, these features improve daily productivity, conversion focus, and data-entry speed without giving AI unsafe autonomy.
