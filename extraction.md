# Extraction from frappe/crm

Compared against upstream `https://github.com/frappe/crm.git` cloned at commit `ab2836b` into `/private/tmp/frappe-crm-upstream`.

Local project inspected: `/Users/alihaiderjaffery/Desktop/CRM`.

The upstream app is a Frappe/Python/Vue CRM, while this project is a Next/Prisma/Better Auth CRM. Some upstream strengths are framework features, so this file translates them into concepts that can be adopted here rather than copied verbatim.

## Security-first summary

Your CRM already has several security controls that are stronger or more explicit than upstream Frappe CRM:

- Central `serverAction()` wrapper with `requireUser()`, `requirePermission()`, Zod parsing, typed results, and Sentry logging.
- Explicit role-permission matrix in `lib/permissions/rbac.ts`.
- Agent ownership checks in service/repository code.
- Private document storage with short-lived signed URLs and audited downloads.
- PII redaction before logs/Sentry/audit snapshots.
- Append-only AuditLog design at the DB-role level, pending production `crm_app` setup.
- Cron routes gated by bearer secret and covered by route tests.
- Migration drift checks in release CI.

The useful upstream security ideas that are not present, or only partially present, are mostly around hierarchical visibility, rate-limit persistence, secret field handling, XSS-safe rich HTML rendering, invitation lifecycle, and automated security scanning.

## Highest-value security gaps to consider

### 1. Hierarchical record visibility

Upstream has `CRM Sales Hierarchy`, documented in `docs/user-hierarchy.md` and enforced in `crm/permissions/org_hierarchy.py`.

What upstream does well:

- Sales users see their own leads/deals.
- Sales managers can be put into a reporting tree and see their own subtree, not necessarily the entire company.
- Visibility includes records assigned through ToDo, not only owner fields.
- The permission logic is enforced both in list-query conditions and per-document `has_permission`.
- The hierarchy is optional and reversible.
- The UI supports add, move, remove, collapse, search, and read-only viewing for non-admins.

What this project has now:

- Flat roles: `ADMIN`, `MANAGER`, `AGENT`, `ACCOUNTANT`.
- Agents are ownership-scoped by `assignedAgentId`.
- Managers appear to have broad visibility, not subtree visibility.

Recommendation:

- Add an `OrgNode` or `SalesHierarchy` model with `userId`, `managerId`, and either nested-set columns (`lft`, `rgt`) or a closure table.
- Replace broad manager scoping with `visibleAgentIds(user)` in services and dashboard/report scopes.
- Apply it consistently to customers, leads, bookings, payments, quotations, tasks, documents, dashboard widgets, and reports.
- Add tests equivalent to upstream `crm/permissions/test_org_hierarchy.py`: admin bypass, manager-in-tree subtree access, manager-outside-tree policy, agent own access, direct assignment access, and non-team denial.

Security impact:

- Prevents over-broad manager access in multi-branch agencies.
- Gives a clean answer to "manager should see only their team" without creating custom roles per branch.

### 2. Server-side password-change lockout

Upstream `crm/api/user.py` protects password change with:

- `@rate_limit(limit=5, seconds=300)`.
- `LoginAttemptTracker(user)` to block repeated current-password guessing.
- Server-side password-strength validation.

What this project has now:

- Better Auth login rate limits in `lib/auth/server.ts`.
- `changePassword()` verifies the current password and enforces schema strength.
- No per-user lockout/counter for repeated failed current-password attempts.
- Better Auth rate-limit storage is documented as in-memory unless switched to DB storage.

Recommendation:

- Add DB-backed rate-limit storage for Better Auth if available in the chosen Better Auth version.
- Add a small `SecurityAttempt` or `PasswordAttempt` table for `changePassword`, keyed by `userId` and IP, with a 5-minute window.
- Lock the password-change endpoint after repeated current-password failures.
- Audit successful and failed password-change attempts without storing the attempted password.

Security impact:

- Reduces risk from an attacker with an active session trying to brute-force the current password.
- Makes lockout behavior stable on serverless/multi-instance deployments.

### 3. Invitation lifecycle instead of plain temporary passwords

Upstream has `CRM Invitation` in `crm/fcrm/doctype/crm_invitation/`:

- Generates an invitation key.
- Sends an invite email.
- Tracks `Pending`, `Accepted`, and `Expired`.
- Expires invitations after 3 days.
- Accepting clears the key and records `accepted_at`.
- Role assignment happens server-side.

What this project has now:

- Admin-created users with a temporary password.
- `mustChangePassword` flag.
- Self-registration creates a deactivated account pending admin approval.
- No invite token lifecycle for admin-invited users.

Recommendation:

- Add an `Invitation` model with hashed token, email, role, invitedById, status, expiresAt, acceptedAt.
- Email an invite link instead of showing/storing temporary passwords in the admin UI.
- Store only a hash of the invite token, not the raw token.
- Add resend/revoke actions.
- Enforce role assignment server-side; never accept role from the invite acceptance request.

Security impact:

- Avoids admins copying temporary passwords around.
- Gives revocation, expiry, and auditability for onboarding.

### 4. Secret field semantics for integrations

Upstream DocTypes mark integration secrets as `Password` fields, including:

- `CRM Twilio Settings`: `api_secret`, `auth_token`.
- `CRM Exotel Settings`: `api_token`.
- `ERPNext CRM Settings`: `api_secret`.
- `Lead Sync Source`: `access_token`.

What this project has now:

- Provider secrets are mostly env-driven or not yet implemented as first-class integration settings.
- No reusable app-level "secret setting" abstraction for encrypted-at-rest, write-only, masked display fields.

Recommendation:

- If integration settings become tenant-editable, add a `SecretSetting` helper rather than storing secrets as ordinary text columns.
- Show masked values in UI.
- Support "replace secret" without ever returning the current secret to the browser.
- Redact these fields in logs/audit using the existing redaction pipeline.

Security impact:

- Avoids accidental exposure when adding Twilio, WhatsApp, ERPNext, or SMTP settings.

### 5. XSS-safe rich HTML rendering

Upstream uses `dompurify` and a central `sanitizeHTML()` helper in `frontend/src/utils/index.js`, with sanitized use in comments, WhatsApp messages, notifications, calendar descriptions, tasks, and HTML controls.

What this project has now:

- Mostly plain React rendering.
- No broad rich-text/comment/email-template surface yet.
- No centralized HTML sanitization utility for future rich HTML surfaces.

Recommendation:

- Before adding email templates, rich notes, custom fields with HTML, or WhatsApp rendering, add a single HTML sanitizer boundary.
- Prefer server-side sanitization before storage plus client-side sanitization before rendering if untrusted HTML is allowed.
- Ban `dangerouslySetInnerHTML` outside a reviewed component such as `<SafeHtml html={...} />`.
- Add ESLint/Semgrep checks for raw `dangerouslySetInnerHTML`.

Security impact:

- Prevents stored XSS when comments/templates/messages become rich HTML.

### 6. Automated security scanning in CI

Upstream `.github/workflows/linters.yml` runs:

- Semgrep with Frappe rules and Python correctness rules.
- Pre-commit checks.
- Commit title linting.

What this project has now:

- CI, preview checks, release checks, migration drift checks, unit/integration/E2E tests.
- No Semgrep, CodeQL, dependency audit, or secret scan workflow found.

Recommendation:

- Add Semgrep for TypeScript/React/Next rules.
- Add CodeQL for JavaScript/TypeScript.
- Add `pnpm audit --prod` or an equivalent dependency vulnerability gate.
- Add secret scanning with Gitleaks or TruffleHog.
- Add a rule that flags `dangerouslySetInnerHTML`, raw SQL without parameterization, `console.log` of sensitive data, and direct DB reads in authenticated app surfaces that bypass service authorization.

Security impact:

- Catches classes of bugs that tests rarely cover.

### 7. Migration upgrade testing from previous release

Upstream `.github/workflows/migration-test.yml` installs the base branch, then swaps in PR code and runs `bench migrate`.

What this project has now:

- Fresh DB migration apply in preview/release workflows.
- Prisma schema drift check in release workflow.
- No explicit "last release -> current PR" upgrade path test.

Recommendation:

- Add a CI workflow that restores a latest-production-like dump or installs the latest tag schema, then applies the PR migrations.
- Run smoke queries after migration.

Security/reliability impact:

- Catches destructive or incompatible migrations before production.
- Especially useful for auth, audit, and permission-related schema changes.

### 8. Public OAuth provider discovery

Upstream `crm/api/auth.py` exposes enabled social login providers and only returns providers with a configured client secret and OAuth keys.

What this project has now:

- Email/password auth.
- Better Auth `Account` table supports OAuth-shaped data, but OAuth provider UX/config was not found.

Recommendation:

- If OAuth/SSO is needed, implement a provider discovery endpoint that returns only enabled providers and never leaks client secrets.
- Add allowlisted redirect URLs and provider tests.

Security impact:

- Supports SSO without exposing partial or misconfigured providers.

## Product and UX strengths upstream has that are missing or only partial here

### 1. Flexible saved views and field layouts

Upstream has:

- `CRM View Settings`
- `CRM Fields Layout`
- `CRM Form Script`
- frontend components for field layout editing, view controls, column settings, quick filters, filters, and condition builders.

What this project has now:

- Lead kanban/list and fixed module forms.
- No user/admin configurable saved views or layouts found.

Recommendation:

- Start with saved list views: filters, columns, sort, visibility (`private`, `team`, `global`).
- Then add layout configuration only for low-risk fields.
- Treat custom scripts as a security-sensitive feature; avoid arbitrary JavaScript unless sandboxed and admin-only.

### 2. Rich lead/deal activity workspace

Upstream lead/deal pages combine:

- Activities
- Comments
- Notes
- Tasks
- Attachments
- Assignment
- Email/WhatsApp/call activity
- Timeline preferences

What this project has now:

- Separate interactions, tasks, documents, leads, customers, bookings, payments, quotations.
- Less evidence of one unified "relationship timeline" workspace.

Recommendation:

- Build a unified timeline component per customer/lead/booking with calls, WhatsApp, email, notes, tasks, documents, quotation sends, payment events, status changes, and audit-relevant events.
- Keep write permissions per event type.

### 3. Service-level agreements and response deadlines

Upstream has `CRM Service Level Agreement`, priorities, working hours, holidays, response timers, rolling response tracking, and SLA status fields on leads/deals.

What this project has now:

- Tasks/reminders and cron sweeps.
- No SLA policy model found.

Recommendation:

- Add optional SLA policies for leads: first response due, follow-up cadence, priority, business hours, holidays.
- Compute `responseDueAt`, `firstRespondedAt`, `slaStatus`.
- Surface overdue leads in dashboard and reports.

Security note:

- SLA visibility must use the same ownership/hierarchy scoping as leads.

### 4. Telephony integrations

Upstream has Twilio and Exotel settings, call UI, telephony agents/phones, call logs, and call-to-lead conversion logic.

What this project has now:

- Interaction type `CALL`, but no integrated calling/call recording/provider settings found.

Recommendation:

- Add provider-agnostic `CallLog` records first.
- Integrate one provider after secret storage/redaction is ready.
- Require explicit consent/compliance handling before call recording.

### 5. WhatsApp integration

Upstream supports WhatsApp message linkage and UI surfaces, with permission checks around referenced documents.

What this project has now:

- `WHATSAPP` interaction type and likely `wa.me` links from the spec.
- No full send/receive/template integration found.

Recommendation:

- Keep outbound `wa.me` as low-risk MVP.
- For full integration, add inbound webhook signature validation, message-to-lead/customer matching, template management, and sanitized rendering.

### 6. ERPNext/accounting integration

Upstream has ERPNext CRM settings, item/product sync, customer creation hooks, quotation/sales order JS hooks, and sync issue records.

What this project has now:

- Native invoices/payments/quotations.
- No ERP/accounting connector found.

Recommendation:

- If accounting integration matters, add a connector boundary with explicit sync jobs, sync logs, retry/error records, and idempotency keys.
- Avoid direct coupling from business services to provider APIs.

### 7. Product catalog and sync issues

Upstream has:

- `CRM Product`
- `CRM Products`
- `CRM Product Sync Issue`
- reconciliation/sync utilities.

What this project has now:

- Package templates were added.
- No generic product catalog with sync/reconciliation issue tracking found.

Recommendation:

- If travel packages are becoming sellable line items, add a product/package catalog with versioned pricing and explicit sync/import issue records.

### 8. Organization and contact model

Upstream separates organizations, contacts, leads, and deals.

What this project has now:

- Customer and lead models, with travel-agency-specific PII.
- No separate B2B organization/account model found.

Recommendation:

- Add `Organization` only if B2B/corporate travel is a real workflow.
- Keep personal traveler PII in `Customer`; do not overload `Organization` with passport fields.

### 9. Territory tree

Upstream has `CRM Territory` as a tree.

What this project has now:

- No territory hierarchy found.

Recommendation:

- Add only if sales teams are regionally segmented.
- If added, combine territory scoping carefully with sales hierarchy and role permissions.

### 10. Notifications

Upstream has `CRM Notification`, socket usage, notification stores, and event notification scheduled tasks.

What this project has now:

- Email outbox, daily summaries, and notification preferences.
- No real-time in-app notification system found.

Recommendation:

- Add an `AppNotification` table with read/unread state and optional email delivery.
- Use polling first; add realtime later only if needed.

### 11. Email account setup and email templates

Upstream supports email account creation for Frappe Mail, Gmail, Outlook, SendGrid, SparkPost, Yahoo, and Yandex, plus template editing.

What this project has now:

- Resend-based outbound email outbox and sender config.
- No full inbox sync or multi-provider email account setup found.

Recommendation:

- Keep Resend for transactional mail.
- Add templates with strict variable interpolation and preview.
- Add inbound email sync only if the CRM needs shared inbox behavior.

Security note:

- Email templates are an XSS/injection surface. Sanitize preview HTML and avoid exposing secrets in template context.

### 12. Exchange-rate providers and caching

Upstream has exchange-rate provider fallback and tests in `crm/api/exchange_rate.py` and `crm/tests/test_exchange_rate.py`.

What this project has now:

- PKR-focused money model.
- No exchange-rate abstraction found.

Recommendation:

- Add only if multi-currency quoting/invoicing is needed.
- Cache rates by currency/date/provider and record the rate used on each quotation/invoice for auditability.

### 13. Localization

Upstream ships many `.po` locale files and a scheduled POT regeneration workflow.

What this project has now:

- Hardcoded English UI strings found.
- Timezone and formatting are explicit, but no translation system.

Recommendation:

- Add i18n only when required by users.
- If added, start with route-level message catalogs and keep audit/action enum values stable in English internally.

### 14. PWA/mobile polish

Upstream frontend uses Vite PWA and has mobile-specific layout components.

What this project has now:

- Responsive Next UI, but no PWA manifest/service worker found.

Recommendation:

- Add installable PWA support only if field agents need mobile-first/offline-ish behavior.
- Be careful caching authenticated CRM data in a service worker.

### 15. Demo/live demo data tooling

Upstream has `crm/demo/*`, setup wizard integration, and live demo controls.

What this project has now:

- Prisma seed data for development/CI.
- No guided demo/live-demo reset tooling found.

Recommendation:

- Add richer seed scenarios for role testing, hierarchy testing, and import/reporting demos.
- Keep demo credentials blocked in production.

## Upstream controls to be cautious about

Not every upstream pattern should be copied directly.

- `CRM Form Script` enables custom scripting. That is powerful but high-risk. In this stack, avoid arbitrary admin JavaScript unless you can sandbox it.
- Some upstream APIs use `ignore_permissions=True` internally after explicit checks. In this project, keep the service-layer permission pattern and avoid bypass flags unless inside a narrowly audited transaction.
- Upstream invitation keys are generated and stored as raw keys. If implemented here, store hashed tokens.
- Upstream `CRM Invitation.accept_invitation()` appears to require `System Manager` or `Sales Manager` in the method, while the emailed link points to an API accept route elsewhere. Make sure any invite acceptance flow here is usable by unauthenticated invitees but only grants the exact invited role after token validation.
- Rich email rendering through iframe/srcdoc and sanitized HTML needs careful CSP and sandboxing if ported.

## Suggested implementation order

1. Add security scanning CI: Semgrep/CodeQL/secret scan/dependency audit.
2. Move auth rate limits to persistent storage and add password-change attempt lockout.
3. Add invitation-token onboarding to replace temporary password handling.
4. Add sales hierarchy/subtree scoping if managers should not see the whole agency.
5. Add a `SafeHtml` sanitizer before any rich comments/templates/messages.
6. Add saved views/column presets for leads/customers/bookings.
7. Add unified activity timeline.
8. Add SLA policies for lead response management.
9. Add integrations only after secret storage and webhook verification patterns exist.

## Source files inspected upstream

Key upstream files:

- `README.md`
- `pyproject.toml`
- `package.json`
- `frontend/package.json`
- `crm/hooks.py`
- `docs/user-hierarchy.md`
- `crm/permissions/org_hierarchy.py`
- `crm/permissions/test_org_hierarchy.py`
- `crm/api/user.py`
- `crm/api/auth.py`
- `crm/api/settings.py`
- `crm/fcrm/doctype/*/*.json`
- `crm/fcrm/doctype/crm_invitation/crm_invitation.py`
- `crm/fcrm/doctype/crm_service_level_agreement/crm_service_level_agreement.py`
- `frontend/src/utils/index.js`
- `.github/workflows/*.yml`

Key local files used for comparison:

- `SECURITY.md`
- `package.json`
- `prisma/schema.prisma`
- `lib/auth/server.ts`
- `lib/permissions/rbac.ts`
- `lib/permissions/helpers.ts`
- `modules/users/users.service.ts`
- `.github/workflows/*.yml`
