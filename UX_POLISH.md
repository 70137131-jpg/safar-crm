# UX_POLISH.md — Safar CRM RC1 UX Review

**Date:** 2026-06-20 · **Scope:** Dashboard, Customers, Leads, Tasks, Bookings, Payments, Quotations, Invoices, Documents, Reports, Settings.

## Verdict

The UI is already at a high baseline — disciplined design tokens, full dark mode, responsive shell, and consistent primitives. This is **not** a codebase that needs a visual rebuild. The polish work here is targeted: one real accessibility gap fixed, and the systemic quality verified so it isn't regressed.

## Verified strong (no change needed)

- **Design tokens** — `globals.css` defines a complete neutral palette + semantic `success/warning/info` + per-theme chart colors, in both `:root` and `.dark`. Components reference tokens (`bg-card`, `text-muted-foreground`, …), never raw colors.
- **Dark mode** — `next-themes` (`system` default, `suppressHydrationWarning`); a repo-wide scan found **zero** hardcoded `bg-white/gray/black` classes lacking a `dark:` variant. Dark mode is consistent.
- **Typography** — consistent scale via the shared `PageHeader` (`text-xl md:text-2xl font-semibold tracking-tight`) and muted descriptions; body uses `rlig`/`calt` font features.
- **Spacing** — shared `PageWrapper`/`PageHeader`; content padding `p-4 md:p-6`; section rhythm via `space-y-6`.
- **Responsiveness** — persistent sidebar on `md+`, slide-in drawer below with overlay; tables collapse to cards under 640px; Playwright has a dedicated `mobile` (iPhone 14) project.
- **Loading states** — dashboard streams via per-widget `<Suspense>` + skeletons; route-level `app/(app)/loading.tsx` added this session; forms disable the submit button while pending.
- **Empty states** — present across list/widget surfaces (icon + message + hint), e.g. RecentPayments, RecentLeads, TasksWidget, UpcomingTravel.
- **Error states** — `error.tsx` (app group) + `global-error.tsx` added this session (retry + Sentry capture); `not-found.tsx` present.
- **Feedback** — `sonner` toasts with `richColors` on every `ActionResult`; consistent success/error messaging.
- **Focus** — buttons/inputs carry `focus-visible:ring-2 ring-ring ring-offset-2`.

## Fixed this pass

- **Accessibility — skip-to-content link (WCAG 2.4.1 Bypass Blocks).** Added a visually-hidden "Skip to main content" link as the first focusable element in `AppShell`, targeting `#main-content` (the `<main>`, now `tabIndex={-1}`). Keyboard and screen-reader users can now jump past the sidebar on every page. Visible only on focus; no visual change otherwise.

## Recommendations (non-blocking, deferred)

These are genuine refinements, not defects — left for a focused design iteration rather than risked as broad edits before RC1:

1. **Content max-width on form/detail pages** — very wide screens stretch single-column forms edge-to-edge. Constrain form/detail layouts (e.g. `max-w-3xl`) while keeping tables full-width (Linear/Stripe pattern). Page-by-page judgement call.
2. **Explicit mobile assertions in E2E** — the `mobile` project runs all specs; add assertions for no-horizontal-overflow and ≥44px touch targets at 390/430/768px (see TESTING.md §6).
3. **Reduced-motion** — the card `hover:-translate-y-0.5`/`active:scale` micro-interactions could honor `prefers-reduced-motion: reduce`.
4. **Form field-level errors** — confirm every RHF form surfaces server `ActionResult.field` errors inline (toast is present everywhere; inline field mapping is the polish).
5. **Table density toggle / sticky header** — nice-to-have for long lists on desktop.

## Method

Reviewed the shared layout/token layer (where systemic issues live) and scanned all `app`/`components` `.tsx` for dark-mode-breaking colors and state-handling patterns. Applied only the change that was unambiguously correct and low-risk (skip link). Verified: `pnpm typecheck`, `vitest run` (246 passed), `pnpm build` all green.
