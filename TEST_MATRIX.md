# TEST_MATRIX.md — Safar CRM

Per-flow coverage for the QA brief. **Legend:** ✅ covered & verified · 🟡 partial (one layer only) · ⛔ not yet automated (manual/recommended).
**Layers:** U = unit, I = integration, E = E2E, M = manual.
As of 2026-06-20: U/I = **246 tests, all green**; E = auth/customers/documents specs present (need a seeded running app).

---

## Auth
| Flow | Layer | Status | Notes |
|------|-------|--------|-------|
| Login (valid) | E | ✅ | `auth.spec.ts` |
| Logout | E | ✅ | `auth.spec.ts` |
| Invalid password | E | ✅ | stays on /login, error toast |
| Session persistence | E | ✅ | reload + direct nav |
| Unauthenticated redirect | E | ✅ | protected route → /login |
| Session expiry | M | 🟡 | sliding 7d; verify by clearing/expiring `Session` row |
| Password reset (admin-initiated) | U | 🟡 | `users.service.resetPassword` + `mustChangePassword`; no self-service email flow (by design) |
| First-login password change | M | 🟡 | `mustChangePassword` flag set on create/reset |
| Per-role login (ADMIN/MANAGER/AGENT/ACCOUNTANT) | E | ⛔ | enabled now that seed creates all four roles — add `rbac.spec.ts` |

## Customers
| Flow | Layer | Status |
|------|-------|--------|
| Create / Edit | U,E | ✅ |
| Search (name/phone/email/passport-4) | U | ✅ (service); E 🟡 |
| Pagination | U,E | ✅ |
| CSV import (chunked, per-row errors) | U | ✅ |
| Soft delete / Restore | U | ✅ (E 🟡) |
| Ownership (AGENT sees own only) | U | ✅ `customers.service.test` + direct-ID NotFound |

## Leads
| Flow | Layer | Status |
|------|-------|--------|
| Create / Edit / Assign | U | ✅ (`leads.service.test`, 30) |
| Status transitions (OCC) | U | ✅ |
| Convert to customer / booking | U | ✅ |
| Lost flow (reason required) | U | ✅ (+ DB CHECK `lead_lost_reason_when_lost`) |
| Interaction logging | U | ✅ (`interactions.service.test`) |
| Kanban drag/drop | E | ⛔ recommended (assert persisted status) |

## Tasks
| Flow | Layer | Status |
|------|-------|--------|
| Create / Complete / Reassign | U | ✅ (`tasks.service.test`) |
| Overdue detection | U | ✅ |
| Passport reminders (cron) | U,I | ✅ service + cron auth; DB-idempotency via partial unique index |
| Payment reminders (cron) | U,I | ✅ |
| Daily summary | U | 🟡 service path; verify toggle in Settings |
| Cron idempotency (double-fire) | I | ✅ auth/contract; ⛔ add DB-backed double-run assertion |

## Bookings
| Flow | Layer | Status |
|------|-------|--------|
| Create | U | ✅ (`bookings.service.test`) |
| Status transitions (+ events) | U | ✅ (+ `BookingStatusEvent`) |
| Cancel + reason required | U | ✅ (+ DB CHECK `booking_cancel_consistency`) |
| Ownership (via customer's agent) | U | ✅ |
| Travel-date validation | U | ✅ |
| Balance calculation | U | ✅ (derived: total − Σ PAID) |

## Payments
| Flow | Layer | Status |
|------|-------|--------|
| Record / Partial / Full | U | ✅ (`payments.service.test`, 17) |
| Refund / Partial refund | U | ✅ (negative PAID row) |
| Overpayment prevention | U | ✅ (guard under row lock) |
| Concurrent race | U | ✅ (recompute Σ inside `FOR UPDATE` tx) |
| `booking.paidPaisa` / balance / refund totals | U | ✅ |

## Quotations
| Flow | Layer | Status |
|------|-------|--------|
| Draft create/edit | U | ✅ (`quotations.service.test`) |
| Send | U | ✅ (+ outbox enqueue) |
| PDF generation | U | 🟡 generator unit-covered; E render ⛔ |
| Upload to R2 / Email send | U,I | 🟡 service + outbox drain (integration) |
| Accept / Expire (cron) | U | ✅ |
| Numbering (QT/SQ-YYYY-NNNNN) | U | ✅ (`numbering.test` + sequence) |

## Invoices
| Flow | Layer | Status |
|------|-------|--------|
| Issue / Mark paid / Void | U | ✅ (`invoices.service.test`) |
| Number generation | U | ✅ (sequence) |
| Permissions (ACCOUNTANT/ADMIN) | U | ✅ (matrix) |

## Documents
| Flow | Layer | Status |
|------|-------|--------|
| Upload (presigned, type/size limits) | U,E | ✅ |
| Download (gated → 5-min signed URL) | U,E | ✅ `documents.spec.ts` |
| Signed URL TTL / no email embedding | U | ✅ |
| Expiry tracking (cron) | U,I | ✅ |
| Delete / permission checks | U | ✅ |

## Reports
| Flow | Layer | Status |
|------|-------|--------|
| Revenue / Leads / Agents / Destinations / Payments / Tasks | U | ✅ (`reports.service.test`, 28) |
| Filters (date ≤ 1yr, agent, destination) | U | ✅ |
| Role scoping (AGENT own; ACCOUNTANT financial-only) | U | ✅ |
| CSV / Excel / PDF export | U | 🟡 service-covered; E download ⛔ |

## RBAC (cross-cutting)
| Check | Layer | Status |
|-------|-------|--------|
| Full role × permission matrix | U | ✅ `permissions.test` (23) |
| ADMIN full / MANAGER no users:manage / AGENT own / ACCOUNTANT financial | U | ✅ |
| Forbidden action → 403/redirect (server) | U | ✅ (service throws Forbidden) |
| Hidden UI actions per role | E | ⛔ add `rbac.spec.ts` |
| Dashboard ownership scoping | U | ✅ `dashboard-scope.test` (added) |

## Mobile (Playwright `mobile` project = iPhone 14)
| Viewport / check | Status |
|------|--------|
| 390 / 430 / 768px no overflow | ⛔ add explicit assertions |
| Tables collapse to cards (<640px) | 🟡 implemented; assert in E2E |
| Dialogs / drawers open | 🟡 implemented; assert in E2E |
| Touch targets ≥ 44px | ⛔ assert in E2E |

## Cron (all six)
| Job | Layer | Status |
|-----|-------|--------|
| drain-email-outbox | I | ✅ auth; idempotent via SKIP LOCKED |
| sweep-reminders | I | ✅ |
| sweep-passport-expiry | I | ✅ (DB partial-unique idempotency) |
| sweep-payment-due | I | ✅ |
| sweep-quotation-expiry | I | ✅ |
| sweep-document-expiry | I | ✅ |
| Failure → Sentry tagged `cron:*` | — | ✅ added this pass |

---

## Gap summary (to reach full deploy-with-confidence)
1. `rbac.spec.ts` (now unblocked: seed has all four roles).
2. E2E for leads / bookings / payments / quotations / reports-export.
3. Explicit mobile assertions in the `mobile` project.
4. DB-backed cron double-run idempotency test.

All gaps are **E2E breadth**; the business-logic + permission core is unit-verified (246 green). See TESTING.md §6 for the build-out plan and flaky-test guidance.
