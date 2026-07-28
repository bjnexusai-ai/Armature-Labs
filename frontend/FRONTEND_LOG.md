# FRONTEND LOG — Armature Labs

Read this first at the start of every session. Mirrors the backend's
`BUILD_LOG.md` in spirit. Update it before ending every session.

---

## Session 1 — COMPLETE (App shell, auth, role-based nav)

**Depends on:** Backend Session 1 (auth/RBAC) — confirmed live, 40/40 backend
tests passing as of this session (Sessions 1-2 both complete on the backend).

**Stack confirmed:** React 19 + TypeScript + Tailwind v4 (via `@tailwindcss/vite`,
no separate PostCSS config needed) + Vite + react-router-dom. `tsc -b && vite build`
verified clean, zero type errors, zero build warnings.

**What's built:**

- `AuthProvider`/`useAuth` — login/logout, `sessionStorage` persistence
  (accessToken, refreshToken, currentUser). sessionStorage over localStorage
  is the same deliberate-but-flagged decision from the Wiring Prompt — clears
  on tab close, revisit before production (Session 9's call, not this one's).
- `apiFetch` wrapper (`src/lib/api.ts`) — attaches bearer token, throws
  `ApiError` with `.status` so callers can branch on 401 vs 403 vs network
  failure, matching the Wiring Prompt's documented error responses exactly.
- `LoginPage` wired to the REAL `POST /api/auth/login` (not a demo timeout) —
  shows the backend's 401/403 messages verbatim, handles the network-down case
  ("Could not reach the server...") separately.
- `AuthUser`/`LoginResponse` types mirror the CONFIRMED camelCase login
  response from the Wiring Prompt — not guessed.
- Role-based nav (`src/lib/navConfig.ts`) — single source of truth for which
  nav items a role can see. **This is UI convenience only** — every gate here
  is re-enforced server-side already (requireRole/requireBillingAccess/
  requirePortalPermission); hiding a nav item is never the only protection.
- Every nav item beyond Session 1 (Cases, Approvals, Invoices, Messages,
  Materials, Reports, Equipment) renders as a disabled "Coming soon — Frontend
  Session N" stub with a real route, so the URL exists but nothing is wired
  ahead of its matching backend session — same discipline the Wiring Prompt
  applied to the demo HTML's stubbed sidebar items.
- Design tokens ported verbatim into `src/index.css`'s Tailwind `@theme`
  block from the existing demo `index.html` / decisions log — established
  brand system reused, not reinvented.

**Design-parity pass (same session, added on request):** the demo `index.html`'s
full visual system was ported, not just its color tokens — animated hero tooth
+ counter-rotating dashed mesh rings + ambient glow on the login brand panel,
glassmorphic blurred topbar, corner-blob metric cards, the workflow pipeline
tracker (with pulsing active-step animation), toast stack, notification
dropdown, password-visibility icon-swap, count-up animation on metric
numbers, card entrance animations, `prefers-reduced-motion` respected
throughout. `MetricCard`/`WorkflowTracker`/`ToastProvider` are built as
reusable components with clearly-labeled example data on the dashboard —
real data wires in once the matching backend session (2 for cases, 3 for
notifications, 7 for aggregate metrics) is live. The demo HTML file itself
is not used again after this — its markup/JS wasn't ported, only its design
tokens and animation behavior, reimplemented natively in React/CSS.

## Session 2 — COMPLETE (Case queue, case detail, New Case form)

**Depends on:** Backend Session 2 (case CRUD, 10-status state machine) —
confirmed live against `backend/src/routes/cases.routes.js`,
`practices.routes.js`, `reference.routes.js`.

**Correction to the historical record:** commit `ee0208b` ("Frontend: case
queue, case detail, new case modal, status pill") added
`CaseQueuePage.tsx`, `CaseDetailPage.tsx`, `NewCaseModal.tsx`,
`StatusPill.tsx`, `caseTypes.ts`, and `statusColors.ts` — but that commit
never updated `App.tsx`, `navConfig.ts`, or `lib/api.ts`, and never added
the `--color-pill-*` tokens `statusColors.ts` already referenced. This log
was also never updated at the time, so the gap sat undetected: every nav
item beyond Session 1 still showed "Coming soon," `CaseQueuePage`/
`CaseDetailPage` were dead code (never imported anywhere outside their own
file), and every non-default status pill rendered with a transparent
background. Found and fixed via two patches applied on top of `ee0208b`:

- **`App.tsx`** — imports `CaseQueuePage`/`CaseDetailPage`, adds the real
  `/cases` and `/cases/:id` routes (previously routed to the generic
  `ComingSoon` stub).
- **`navConfig.ts`** — added a `live` flag; Case Queue is the first item to
  set it. `AppShell.tsx`'s stub check now reads `item.session > 1 &&
  !item.live` instead of just `item.session > 1`.
- **`lib/api.ts`** — added `listCases`, `getCase`, `createCase`,
  `listPractices`, `getPractice`, `listCaseTypes`. These were missing
  entirely; the three page/modal components were built calling functions
  that didn't exist yet, which is the real reason nothing worked even once
  routed. Every endpoint path and response shape was confirmed directly
  against the real controllers (`backend/src/controllers/cases.controller.js`,
  `practices.controller.js`, `reference.controller.js`), not guessed.
- **`index.css`** — added the six missing `--color-pill-*` tokens
  (purple/mustard/green/red, bg+text) so In Design / Pending Design
  Approval / Pending Bisque Approval / Shipped Out / Delivered / Delayed
  pills render with an actual background instead of transparent.

**Visual-parity pass (same session):** the login hero icon and sidebar logo
mark were still using a generic 24×24 stroke-outline tooth from an earlier
draft, not the reference demo's 48×48 filled tooth shape — replaced with
the exact reference path in both places. `.metric-card` had no background/
border/shadow defined at all (only the corner-blob pseudo-element) — added,
matching the reference's single flat-blur shadow rather than the Session
1.5 "layered shadow" polish treatment. Sidebar nav now groups under
Overview/Operations/Finance section headers with a per-item icon, ported
from the reference's `.nav-icon` svgs (Approvals/Messages don't exist in
the reference demo, so those two use a matching-style icon instead of
being left blank). Login `.field-input`/`.login-btn`/`.password-toggle` had
no hover or focus states anywhere in the CSS — added (border-glow on
focus, darken+lift on button hover, red border on an empty field on
submit), matching the reference exactly.

`npm install && npm run typecheck && npm run build`: clean, zero errors,
re-verified after both the routing/API fix and the visual-parity fix.

**Not yet verified against a real running backend in this environment:**
same caveat as Session 1 — confirmed against the controller source, not a
live `npm run dev` instance (no network access to localhost:4000 from the
sandbox this was fixed in). Run the pickup checklist below before trusting
this in production.

## Session 1.5 — COMPLETE (Visual polish pass)

Implemented the 8-item approved shortlist from the ChatGPT-sourced polish
list review, on top of Session 1's build. `tsc -b && vite build` re-verified
clean after every item.

- **Skeleton loading** — `MetricCard` takes an optional `loading` prop that
  renders shimmering skeleton bars instead of the icon/value. Dashboard
  demonstrates it with a 550ms simulated flag (no real fetch exists yet);
  Session 2's case list swaps in the same pattern for its real load state.
  The login button's spinner (`.btn-spinner`) was left as-is — that's a
  submit-in-flight state, not a data-loading one, so skeletons don't apply.
- **Empty state** — ported/extended the demo's `.table-empty-state` into a
  generic `.empty-state` class (icon, heading, text, action button).
  `ComingSoon` now uses it instead of a bare dashed box, with a "Back to
  dashboard" action.
- **Restrained hover** — audited existing hover states; none were stacking
  icon-scale + border-glow + bg-shift. Consolidated the card hover into one
  shared `.surface-card` class (shadow deepens + 2px lift, nothing else) so
  future cards inherit the same restrained behavior instead of each
  component inventing its own hover.
- **Live status pill** — `.status-pill` + `.status-dot.live` (breathing
  opacity/scale animation, not box-shadow-based to avoid color-alpha
  issues). Used on the dashboard's example pipeline card ("Live"); ready to
  reuse for real case-status pills in Session 2.
- **Layered shadows** — `--shadow-sm` / `--shadow-md` / `--shadow-lg` tokens
  (small contact shadow + larger ambient one, not one flat blur), applied
  globally via `.surface-card` and swapped into the topbar glass and
  notification dropdown, which were previously flat single-blur shadows.
  Login card and sidebar logo mark already had a proper layered shadow from
  Session 1 and were left untouched.
- **Typography hierarchy** — added an opt-in `.eyebrow` utility rather than
  a global `h1`-`h6` override (would have fought the explicit Tailwind
  classes already set per heading). Tightened two headings that were
  visibly inconsistent in weight/size/tracking ("Signed in as" vs "Example
  case pipeline") to the same scale.
- **Thin scrollbar** — global `scrollbar-width: thin` + WebKit
  `::-webkit-scrollbar` styled to the border-teal token, no browser-default
  chunky scrollbar left anywhere in the app.
- **Sidebar active-indicator slide** — `.nav-link::before` renders a 3px
  white bar that scales/slides in from the sidebar's left edge on the
  active `NavLink`, driven by the existing `isActive` render-prop, no new
  state needed.

**Not yet verified against a real running backend** (do this before Session 2
starts, per the Master Frontend Plan's "how to proceed" checklist):

- Actual login response over the wire — this build follows the Wiring
  Prompt's documented shape, but hasn't been run against a live
  `npm run dev` backend instance in this environment (no network access to
  localhost:4000 from the sandbox this was built in).
- 401 vs 403 message text exactly as the backend returns it today.

**Not yet built (future sessions, per `Armature_Labs_Master_Frontend_Plan.md`):**

- Session 3: approvals UI (Approve/Request Changes, notification triggers,
  "Action required queue" panel).
- Sessions 4-9: per the plan doc.

**How to pick this up in a fresh session:**

1. This lives at `frontend/` in the `Armature-Labs` repo root, as a **sibling
   of `backend/`** (the repo nests the Node/Express/Postgres backend under
   its own `backend/` folder — confirmed directly via `find . -iname
   "*case*"` returning `./backend/src/controllers/cases.controller.js` etc.
   Don't assume backend files sit at repo root). `cd frontend`.
2. `npm install`
3. Have the backend running locally on port 4000 — from `backend/`, its own
   `npm run dev` after migrate/seed steps.
4. `npm run dev`, log in as `owner@dentallab.test` / `TestPass123!`, confirm
   the dashboard loads with real user data (not mocked) and nav items show
   correctly for that role.
5. Click into Case Queue and confirm it loads real cases (not "Coming
   soon") — this was broken until the Session 2 fix above; if it's stubbed
   again, something regressed.
6. Before starting Session 3: confirm the real `approvals` endpoint shapes
   against `backend/src/controllers/approvals.controller.js` directly, the
   same way Session 2's fix confirmed cases/practices/reference endpoints
   — don't build against the spec doc's guessed shape.
7. **Before ending ANY session:** if you added a new page/component, grep
   for it being imported somewhere outside its own file
   (`grep -rn "YourComponent" src/ --include="*.tsx" | grep -v
   "YourComponent.tsx:"`). Session 2's actual root cause was a component
   that existed on disk but was never imported anywhere — a file existing is
   not the same as a feature being live. Confirm nav items pointing at it
   don't still show "Coming soon" in the running app.
8. Update this log, commit + push.

## Session 3 — COMPLETE (Approvals UI)

**Retrofit note added in Session 7:** this session's own listed scope never
included the "Action required queue" dashboard panel, despite the Master
Frontend Plan's explicit Session 3 instruction to "un-hide the 'Action
required queue' panel that was left hardcoded/hidden in Session 0." That
panel did not exist anywhere in the codebase until Session 7 built it
(confirmed via `grep -rn "Action required" frontend/src/` returning zero
matches prior to Session 7). Not rewriting this entry's history — flagging
it here so a future reader of this entry alone doesn't get a false picture
of what actually shipped at the time. See Session 7's entry below for the
retrofit itself.

Built against backend's real `GET /api/approvals`, `POST /api/approvals/:id/approve`,
and `POST /api/approvals/:id/request-changes` — confirmed directly against
`backend/src/controllers/approvals.controller.js` and `approvals.routes.js`
before writing any fetch call, per the Master Frontend Plan's "how to
proceed" checklist. Backend Session 3's list endpoint gap (flagged in
`BUILD_LOG.md`) was already closed in commit `e32397b` on this branch.

**Built:**

- `lib/caseTypes.ts` — `ApprovalRecord`, `ListApprovalsQuery`/`Response`,
  `ApprovalActionResult`/`Response`, `ApprovePayload`, `RequestChangesPayload`.
  Confirmed the list-row shape and the approve/request-changes response
  shape are *not* the same (the latter has no `case_number`/`patient_name`/
  `media_*` join fields) — typed both distinctly rather than assuming they
  matched.
- `lib/api.ts` — `listApprovals`, `approveApproval`, `requestChangesApproval`.
- `lib/statusColors.ts` — `APPROVAL_STATUS_COLORS`, reusing existing tokens
  (mustard/green/red) rather than inventing new ones, same convention as
  the case-status palette.
- `components/ApprovalStatusPill.tsx` — small sibling to `StatusPill`.
- `components/ApprovalActionModal.tsx` — single modal for both Approve and
  Request Changes (mirrors `NewCaseModal`'s form pattern), enforcing
  client-side that `comments` is required for Request Changes (server also
  enforces this — `requestChangesSchema.comments.min(1)` — this is UI
  convenience only).
- `pages/ApprovalsPage.tsx` — status-tab queue (Pending/Approved/Changes
  requested/All), mirrors `CaseQueuePage.tsx`'s table/pagination structure.
  Action buttons are gated on `user.canApprovePhotos` (UI convenience only —
  the real 403 enforcement is `req.user.can_approve_photos` server-side).
- `App.tsx` — routed `/approvals` to the real page (the exact Session 2
  mistake: a page existing without a route — avoided here by wiring it in
  the same commit as the page itself).
- `lib/navConfig.ts` — flipped the `approvals` nav item's `live: true`.
- `layouts/AppShell.tsx` — rewired the notification bell from the static
  `DEMO_NOTIFS` preview to real pending-approval data via `listApprovals({
  status: 'pending', limit: 5 })`; badge dot now only renders when there's
  actually something pending. Also fixed a pre-existing bug found while in
  this file: the header title was hardcoded to always say "Dashboard"
  regardless of route — would have looked broken landing on `/approvals`;
  now derived from `navConfig`'s matching item.

**Visual audit against the reference demo (index.html), done on request:**

Compared every color token, font stack, and pixel value used against the
reference demo directly, not from memory. Found and fixed two real
pre-existing gaps (not introduced this session, but caught while checking):

- `.form-input` — used since Session 2 (`NewCaseModal.tsx`,
  `CaseQueuePage.tsx`'s search/status filter) and by this session's
  `ApprovalActionModal.tsx`, but **never defined anywhere in `index.css`**.
  Every one of those inputs has been rendering as an unstyled browser
  default (no border, no radius, no focus ring) instead of matching the
  reference's `.form-row input,.form-row select` pixel-for-pixel. Added,
  ported verbatim from the reference.
- `.btn-primary` — used by `DashboardPage.tsx`'s "Preview a toast" button,
  also never defined. Not visibly broken (that button carries an inline
  gradient fallback), but the class itself did nothing. Added.

Also replaced this session's own first-draft status-filter tabs (an
invented pill/gradient style with no reference precedent) with the
reference's actual `.range-toggle`/`.range-btn` segmented control — its own
established pattern for "switch between filtered views" (the dashboard's
chart-range switcher) — and added that class pair to `index.css` too, since
it wasn't defined yet either (nothing had used it until now). Also switched
the action modal's case-number subtitle to `IBM Plex Mono`, matching the
reference's own `.modal-head p` rule for case-ID text exactly (this modal's
subtitle literally is a case ID, the same use case the reference rule
exists for).

`tsc -b` / `npm run build` reconfirmed clean after all of the above.



- `tsc -b` and `npm run build` — both clean, zero errors.
- Grepped every new component's import outside its own file (`ApprovalsPage`,
  `ApprovalActionModal`, `ApprovalStatusPill` all confirmed imported and used
  somewhere other than their own file) — the exact Session 2 checklist item.
- Confirmed `navConfig.ts`'s `approvals` entry has `live: true` so the sidebar
  no longer renders it as a "Coming soon" stub.

**Not verified (be honest about this, same as the Session 2 log's own
standard):**

- No live browser click-through against a running backend in this
  environment — Postgres wasn't installable here (package-repo mismatch:
  `security.ubuntu.com` 404s on `postgresql-16`/`libpq5` at the version
  `noble-updates` currently resolves to), so the backend couldn't actually
  be started to click through against. The build/typecheck/grep checks
  above are real, but §6 rule 3 of `PARALLEL_BUILD_PROTOCOL.md` ("actually
  click through it in a running browser") has **not** been satisfied yet.
  Do this before calling Session 3 fully done: `cd backend && npm install
  && npm run migrate:up && npm run seed && npm run dev`, then `cd frontend
  && npm run dev`, log in as a role with `canApprovePhotos: true`, click
  the Approvals nav item (not a typed URL), and confirm a real pending
  approval renders with working Approve / Request Changes actions.

**How to pick this up:**

1. Do the browser click-through above first — this is the one remaining
   gap before Session 3 is fully closed per this project's own rules.
2. Session 4 (Invoices/QC) and Session 5 (Messages/photos/shipments/
   warranty) are both unblocked — their backend sessions are complete,
   tested, and pushed on this branch, same as Session 3's was.

## Session 4 — COMPLETE (Invoices/QC UI), pending browser click-through

Built against backend's real billing/QC endpoints — confirmed directly
against `backend/src/controllers/billing.controller.js`,
`backend/src/routes/billing.routes.js`,
`backend/src/controllers/qc.controller.js`, and
`backend/src/routes/qc.routes.js` before writing any fetch call, per the
Master Frontend Plan's "how to proceed" checklist.

**Scope note confirmed against source, not the resume prompt's summary:**
`qc.controller.js` exports `recordQcResult`, `createCaseRework`,
`listCaseRework`, `createFinalApproval`, and `getFinalApproval` in addition
to the three functions this session covers — but only
`createChecklist`/`listChecklists`/`resolveCaseRework` are actually mounted
on `qc.routes.js`. The rest are wired under `cases.routes.js` instead and
are out of scope here; not built against on a guess.

**Confirmed before coding:**
- Invoice row fields are snake_case under camelCase wrapper keys
  (`invoice`/`invoices`), same convention as `CaseRecord`/`ApprovalRecord`.
  No `dueDate`/`taxAmount`/`paidDate` fields exist on the invoice response
  yet — `PARALLEL_BUILD_PROTOCOL.md` §4's Session 5.5 blocker (schema
  migrated, controller not updated) is still open, confirmed directly
  against `billing.controller.js`'s `getInvoice`/`listInvoices` SELECTs,
  not assumed from the migration file alone. None of this session's UI
  reads or expects those three fields.
- `POST /invoices/:id/payments` is manual mark-paid only (amount, method,
  referenceNote) — no Stripe fields exist on this endpoint yet (that's
  backend Session 8). No "Pay Now" processor click handler was built.
- `requireBillingAccess` = Owner/Office Manager only for invoice
  create/payment actions; portal (`dentist_client`) read access is gated
  server-side on `can_view_invoices` via `requirePortalPermission`, not
  `requireBillingAccess` — both paths flow through the same
  `listInvoices`/`getInvoice` controllers, which branch internally on
  `req.user.role`.
- Entire QC router is `requireInternal` — no portal access at all, gated
  the nav item accordingly (not just role-hidden button, since a
  `dentist_client` hitting `/api/qc/*` gets a flat 403 regardless).
- `PATCH /api/qc/rework/:id/resolve` is not case-scoped — it operates
  directly on a rework record's own id. There's no list-rework endpoint
  mounted on `qc.routes.js` this session, so the UI resolves by a known id
  rather than offering a picker (documented gap, not a guessed workaround).

**Built:**
- `lib/caseTypes.ts` — `InvoiceStatus`, `InvoiceLineItem`, `Payment`,
  `InvoiceListRow`, `InvoiceDetail`, `ListInvoicesResponse`,
  `GetInvoiceResponse`, `CreateInvoiceLineItemInput`, `CreateInvoicePayload`,
  `CreateInvoiceResponse`, `RecordPaymentPayload`, `RecordPaymentResponse`;
  `QcChecklistItem`, `QcChecklist`, `ListChecklistsResponse`,
  `CreateChecklistPayload`, `CreateChecklistResponse`, `ReworkRecord`,
  `ResolveReworkPayload`, `ResolveReworkResponse`.
- `lib/api.ts` — `listInvoices`, `getInvoice`, `createInvoice`,
  `recordPayment`, `listChecklists`, `createChecklist`, `resolveRework`.
- `lib/statusColors.ts` — `INVOICE_STATUS_COLORS`, reusing existing tokens
  (tan/mustard/amber/green) rather than inventing new ones, same convention
  as the case-status and approval-status palettes. Void reuses the neutral
  tan token rather than red — voiding isn't an error state the way
  Delayed/rejected are.
- `components/InvoiceStatusPill.tsx` — small sibling to
  `StatusPill`/`ApprovalStatusPill`.
- `components/NewInvoiceModal.tsx` — practice select + dynamic line-item
  rows (description/qty/unit price, add/remove), live subtotal, mirrors
  `NewCaseModal`'s form pattern. No case-picker for a line item's optional
  `caseId` this session (not in scope) — a line item just isn't tied to a
  case unless added some other way later.
- `components/RecordPaymentModal.tsx` — amount (pre-filled to balance
  due)/method/reference-note form, calls `recordPayment`. Explicitly not a
  payment-processor UI — this records a payment someone already collected
  offline.
- `components/NewChecklistModal.tsx` — name/optional case-type/dynamic
  ordered item list (order = array position = `sort_order` server-side).
- `pages/InvoicesPage.tsx` — role-aware list (the backend branches
  internal-vs-portal, not this page); "New invoice" button hidden for
  everyone but Owner/Office Manager (UI convenience only — creation is
  `requireBillingAccess`-gated server-side regardless).
- `pages/InvoiceDetailPage.tsx` — subtotal/paid/balance summary cards, line
  items table (with a link to the case if `case_id` is set), payment
  timeline, "Mark as paid" action gated to Owner/Office Manager and hidden
  once an invoice is already `Paid` or `Void`.
- `pages/QcPage.tsx` — checklist creation/listing (ordered items rendered
  as a numbered list) + a rework-resolution mini-form (rework id +
  optional resolution notes) calling `resolveRework` directly, since no
  list-rework endpoint exists on this router to build a picker against.
- `App.tsx` — routed `/invoices`, `/invoices/:id`, `/qc` to the real pages
  in this same commit (the exact Session 2 mistake — pages existing
  without routes — avoided here).
- `lib/navConfig.ts` — flipped `invoices`' `live: true`; added a new `qc`
  nav item (didn't exist before), gated to every internal role
  (`owner`/`office_manager`/`assistant_technician`/`designer`), excluding
  `dentist_client` to match `requireInternal` server-side.
- `layouts/AppShell.tsx` — added a `qc` nav icon (drawn in the same
  stroke-icon style as Approvals/Messages, no reference-demo precedent for
  this screen either).

**Verified:**
- `tsc -b` and `npm run build` — both clean, zero errors.
- Grepped every new component's import outside its own file
  (`InvoicesPage`, `InvoiceDetailPage`, `QcPage`, `NewInvoiceModal`,
  `RecordPaymentModal`, `NewChecklistModal`, `InvoiceStatusPill` — all
  confirmed imported and used somewhere other than their own file) — the
  exact Session 2 checklist item.
- Confirmed `navConfig.ts`'s `invoices` and `qc` entries both have
  `live: true` so neither renders as a "Coming soon" stub in the sidebar.

**Visual audit against the reference demo (index.html), done on request:**

The reference has no actual Invoices or QC screen to compare against —
Invoices is nav-stubbed `data-view="soon"` in the demo, and QC doesn't
exist there at all — same situation Session 3 was in for Approvals. Audit
was therefore: confirm every class/token used here was already ported and
verified (not invent new ones), and check pixel values against already-
verified precedent screens (CaseQueuePage/ApprovalsPage) rather than the
demo directly for anything the demo itself doesn't have.

- `.form-input`, `.btn-primary`, `.range-toggle`/`.range-btn`,
  `.modal-overlay`/`.modal-box`, `.status-pill`, `.empty-state`,
  `.skeleton` — all reused verbatim, none reinvented. All `--color-pill-*`
  / `--color-badge-*` tokens used by `INVOICE_STATUS_COLORS` are existing
  ported tokens, confirmed against `reference/index.html`'s `:root` block
  directly, not assumed.
- Table header cells (`text-[11px] uppercase tracking-wider text-ink-soft
  pb-2.5 border-b border-border`) match `ApprovalsPage.tsx`/
  `CaseQueuePage.tsx` exactly — both of those already diverged from the
  reference's actual `.case-table` class in favor of inline Tailwind
  (pre-existing Session 2/3 pattern, not something this session
  introduced or re-litigated).
- **One real gap found and fixed:** the invoice detail summary cards
  (Subtotal/Amount paid/Balance due) were first built as an ad hoc
  `rounded-[16px]` card with no icon block — didn't match the established
  `MetricCard` visual pattern (icon-in-colored-box, `rounded-[18px]`,
  `fade-in`) used everywhere else a metric-style number is shown
  (`DashboardPage.tsx`). Restyled to match that pattern's exact class
  names. `MetricCard` itself wasn't reused directly — its `useCountUp`
  hook `Math.round`s to whole numbers and the component has no currency
  formatting, so reusing it as-is would have silently dropped cents off
  every dollar figure. Documented decision, not a guess.

`tsc -b` / `npm run build` reconfirmed clean after this fix.

**Not verified (be honest about this, same as Session 3's own standard):**
- Built from a sandboxed environment with read-only repo access (no push
  credentials) and no runnable Postgres — `apt-get update` here 403s on
  `deb.nodesource.com` and there's no path to a working local Postgres
  instance, so the backend could not actually be started. §6 rule 3 of
  `PARALLEL_BUILD_PROTOCOL.md` ("actually click through it in a running
  browser") has **not** been satisfied yet, same gap Session 3 logged.
  Delivered as a patch (`git format-patch`) + zip per §10's sandbox
  workflow rather than pushed directly.

**How to pick this up:**
1. Apply the patch (`git am <patch>`), confirm `npm run build` still
   clean in the real Codespace.
2. Do the click-through this log can't do here: `npm run dev` both sides
   (or the Docker Compose flow per the Dev Environment Runbook), log in as
   `owner@dentallab.test` (billing access) — confirm Invoices renders with
   "New invoice" visible, create an invoice, open its detail view, record
   a payment, confirm status/balance update. Log in as
   `dentist@brightsmile.test` (portal, `can_view_invoices: true`) —
   confirm Invoices renders read-only (no "New invoice" button, no
   "Mark as paid"), scoped to their own practice's invoices, and confirm
   Quality Control is fully absent from their nav (not just disabled).
3. Once confirmed, Session 4 is fully closed and Session 5
   (Messages/photos/shipments/warranty) is next — its backend is already
   complete and tested.

## Codespaces/Docker dev-environment notes (added post Session 5.5)

**Vite proxy + Codespaces gotchas found while verifying login end-to-end:**
- `vite.config.ts` proxy target must be the Docker service name (`http://backend:4000`),
  never `localhost` — localhost inside the frontend container is the container itself.
- `server.allowedHosts: true` is required in `vite.config.ts` for the Codespaces
  forwarded domain (`*.app.github.dev`) to not get blocked with a 403.
- `.devcontainer/devcontainer.json` attaches VS Code's session to the `backend`
  service. Never run un-scoped `docker compose up/down/build` from this terminal —
  it can recreate `backend` and kill the active Codespace session. Always scope
  frontend-only changes with `--no-deps`, e.g.:
  `docker compose up -d --no-deps --force-recreate frontend`
- If frontend crash-loops with `ENOENT package.json` after a Codespace resume,
  the bind mount likely resolved against a stale path — a scoped
  `--force-recreate` on frontend alone fixes it without touching backend/postgres.

## Session 5 — COMPLETE (Messages/notes, progress photos, shipments, warranty claims)

**Depends on:** Backend Session 5 (case_notes, progress_photos, shipments,
warranty_claims) — confirmed complete and tested per `BUILD_LOG.md`
(100/100 at Session 5, 174/174 as of the latest backend session on this
branch). Confirmed directly against
`backend/src/controllers/notes.controller.js`,
`backend/src/controllers/progressPhotos.controller.js`,
`backend/src/controllers/fulfillment.controller.js`, and the exact route
mounts in `backend/src/routes/cases.routes.js` /
`backend/src/routes/fulfillment.routes.js` — not the Master Blueprint's
schema description or a guessed shape, per this project's own §5 rule.

**Casing confirmed (not assumed):** all four resources return snake_case
row fields (`case_id`, `author_id`, `file_url`, `taken_at`,
`tracking_number`, `shipped_at`, `delivered_at`, `filed_by`,
`resolution_notes`, `resolved_by`, `resolved_at`) under camelCase wrapper
keys (`note`/`notes`, `progressPhoto`/`progressPhotos`,
`shipment`/`shipments`, `warrantyClaim`/`warrantyClaims`) — same convention
as every prior session (CaseRecord/ApprovalRecord/InvoiceDetail). No `pick()`
dual-fallback needed.

**Key architectural decision (documented, not a guess):** all four
resources are exposed ONLY as case-scoped endpoints
(`/api/cases/:id/notes|progress-photos|shipments|warranty-claims`), plus two
standalone staff actions on `fulfillment.routes.js`
(`PATCH /api/fulfillment/shipments/:id/status`,
`PATCH /api/fulfillment/warranty-claims/:id/resolve`). There is no
`GET /api/notes` / `GET /api/shipments` / etc. list-everything endpoint —
unlike Approvals (Session 3), which got its own top-level `/approvals` nav
page precisely because `GET /api/approvals` exists as a real cross-case
list. Building a standalone "Messages" nav screen here would mean guessing
an endpoint that doesn't exist, which this project's own standing
convention rules out. **Decision: all four features render as tabs inside
`CaseDetailPage.tsx` (`CaseActivityPanel.tsx`), not as a new top-level
route.** The `messages` entry in `navConfig.ts` is left as a Session 5 stub
("Coming soon") rather than wired to a guessed endpoint — revisit only if
a client answer or a future backend session adds a real cross-case list.

**What's built:**

- `lib/caseTypes.ts` — `CaseNote`/`ProgressPhoto`/`Shipment`/`WarrantyClaim`
  plus their List/Create/Update response and payload types, each block
  documenting exactly which controller/route file it was confirmed against.
- `lib/api.ts` — `listNotes`/`createNote`, `listProgressPhotos`/
  `createProgressPhoto`, `listShipments`/`createShipment`/
  `updateShipmentStatus`, `listWarrantyClaims`/`createWarrantyClaim`/
  `resolveWarrantyClaim`.
- `lib/statusColors.ts` — `SHIPMENT_STATUS_COLORS`, `WARRANTY_STATUS_COLORS`.
  Reuses existing `--pill-*`/`--badge-*` tokens exclusively, same rule
  Session 4 followed for `INVOICE_STATUS_COLORS` — no new colors invented,
  each mapping's reasoning commented inline in the file.
- `components/ShipmentStatusPill.tsx`, `components/WarrantyStatusPill.tsx` —
  same one-line shape as the existing `InvoiceStatusPill.tsx`.
- `components/NotesPanel.tsx` — two-way message thread (list + compose).
  Staff get an internal/portal visibility toggle built from the existing
  `.range-toggle`/`.range-btn` classes (same reused pattern as Session 3's
  status filter and Session 4's dashboard range switcher — no new tab
  styling invented); a `dentist_client` author never sees the toggle since
  the backend silently forces `visibility: 'portal'` for that role anyway
  — sending it from the client would just be noise.
- `components/ProgressPhotosPanel.tsx` — internal-only gallery (grid of
  cards, add-photo form). Gated by role in `CaseActivityPanel.tsx`, not by
  a second check duplicated inside the panel itself.
- `components/ShipmentsPanel.tsx` + `components/ShipmentStatusModal.tsx` —
  list + status/carrier/tracking update modal. Creation and the "Update"
  action are internal-only; reads render for every role (the route isn't
  `requireInternal` — the dental office has a legitimate interest in
  tracking info for their own case, confirmed in the controller's own
  comment).
- `components/WarrantyClaimsPanel.tsx` +
  `components/WarrantyClaimResolveModal.tsx` — list + file-a-claim form +
  resolve modal. The "File a claim" button is hidden client-side unless
  `caseRecord.current_status === 'Delivered'` (cosmetic mirror of the
  backend's real 409 gate, not a substitute for it). Resolving is
  internal-only, hidden once `resolved_at` is already set.
- `components/CaseActivityPanel.tsx` — tab wrapper reusing `.range-toggle`
  for tab switching, rendered inside `CaseDetailPage.tsx` below the existing
  case-details/current-stage cards.
- `pages/CaseDetailPage.tsx` — one import + one render line added
  (`<CaseActivityPanel caseRecord={caseRecord} />`) — the existing
  case-detail layout above it is untouched.

**Verified:**

- `npx tsc -b` and `npm run build` — both clean, zero errors, confirmed on
  a fresh `npm install` baseline BEFORE this session's changes (per §5's
  own rule — don't trust a prior session's claimed clean state without
  re-running it) and again AFTER.
- Grepped every new component's import outside its own file
  (`NotesPanel`, `ProgressPhotosPanel`, `ShipmentsPanel`,
  `WarrantyClaimsPanel`, `ShipmentStatusPill`, `WarrantyStatusPill`,
  `ShipmentStatusModal`, `WarrantyClaimResolveModal`, `CaseActivityPanel` —
  all nine confirmed imported and used somewhere other than their own file)
  — the exact Session 2 checklist item this project keeps re-running.

**Not verified (be honest about this, same standard as Sessions 3 and 4):**

- Same sandbox constraint as every prior session on this branch: read-only
  repo access, no push credentials, no runnable Postgres in this
  environment (`apt-get`/`deb.nodesource.com` 403s here) — §6 rule 3
  ("actually click through it in a running browser against the real
  backend") has **not** been satisfied yet. Delivered as a zip of the
  working tree per §10's sandbox workflow, not pushed directly.
- Visual audit against the reference demo (`index.html`) done on request:
  same situation as Sessions 3/4 — the demo has no Messages/Photos/
  Shipments/Warranty screens to compare against. Audit was: confirm every
  class/token used here (`.surface-card`, `.range-toggle`/`.range-btn`,
  `.form-input`, `.btn-primary`, `.status-pill`, `.empty-state`,
  `.skeleton`, `.modal-overlay`/`.modal-box`) was already ported and
  verified in a prior session, not reinvented — confirmed against
  `src/index.css` directly. All `--color-pill-*`/`--color-badge-*` tokens
  used by the two new status-color maps are pre-existing ported tokens.
  Root `:root` values in the reference `index.html` re-diffed against
  `src/index.css` this session — confirmed byte-for-byte identical, no
  drift to fix.

**How to pick this up:**

1. Apply the patch / unzip over the branch, confirm `npm run build` still
   clean in the real Codespace.
2. Do the click-through this log can't do here: `npm run dev` both sides,
   log in as `owner@dentallab.test` — open a Delivered case (or advance one
   there via the existing case-status endpoint), confirm all four tabs
   render, send a message, add a progress photo, create + update a
   shipment, file + resolve a warranty claim. Log in as
   `dentist@brightsmile.test` (portal) against the same case — confirm the
   Progress Photos tab is absent entirely (not just disabled), Messages
   only shows portal-visible notes and hides the visibility toggle,
   Shipments renders read-only (no "New shipment"/"Update" buttons),
   Warranty Claims lets them file (case is Delivered) but not resolve.
3. Once confirmed, Session 5 is fully closed. Session 5.5 (patients,
   invoice due-date/tax/paid fields) is already closed per this branch's
   own commit history (`0efddfa`, corrected status in `4cf4c5c`) — Session
   6 (Phase 3 inventory/practice CRM) is next for frontend, its backend is
   already complete per `BUILD_LOG.md`'s Session 6 entry (144/144 tests).

## Session 6 — COMPLETE (Materials/inventory, procurement, practice CRM)

**Depends on:** Backend Session 6 (Phase 3 inventory/procurement + practice
CRM) — confirmed complete by re-cloning the live repo
(`github.com/bjnexusai-ai/Armature-Labs`, `main` @ `87ab027`) and reading
`inventory.controller.js`/`inventory.routes.js`,
`procurement.controller.js`/`procurement.routes.js`, and
`accounts.controller.js` (contracts/notes, mounted on `practices.routes.js`)
directly — not from a prior session's notes. `BUILD_LOG.md`'s Session 6
entry (144/144 tests, 13/13 suites, commit `35af7d7`) matches.
`PARALLEL_BUILD_PROTOCOL.md`'s status board already had this row correct.

**Context — two prior attempts at this exact session were lost before
delivery** (ran out of tool-use/message budget mid-build in separate chat
sessions, one of which got as far as writing files but never zipped or
verified them). This session started from a fresh clone rather than trusting
either prior attempt's claimed state, per this project's own "verify
against ground truth" rule.

**Casing correction worth flagging for any future session touching these
three controllers:** unlike the auth response, `inventory.controller.js`,
`procurement.controller.js`, and `accounts.controller.js` do **not**
camelCase their SQL rows — there's no serializer middleware in `app.js`.
Every row field is the raw snake_case column name off `RETURNING`/`SELECT`
(`category_id`, `unit_cost`, `current_stock`, `po_number`,
`quantity_ordered`, `payment_terms`, etc.), under a camelCase wrapper key
(`material`, `materials`, `purchaseOrder`, `contract`...) — identical
convention to `InvoiceListRow`/`InvoiceDetail`. Confirmed by reading the
controller source directly, then cross-checked against
`billing.controller.js` as a second data point. Input payload fields ARE
camelCase (zod schemas use `z.coerce` on `categoryId`/`unitCost`/etc.).

**Endpoint shapes confirmed against real source before building:**

- `/api/inventory/*` — entire router `requireAuth` + `requireInternal` (no
  `dentist_client` access anywhere in Phase 3). Category/material creation
  and `POST /materials/:id/adjust` are `requireManagerRole`;
  `POST /materials/:id/consume` and all reads are open to any internal
  staff. Sign convention: Consumption always takes a positive "how much
  used" from the caller and the backend stores it signed negative;
  Adjustment is the one case where the caller supplies the actual signed
  delta.
- `/api/procurement/*` — entire router `requireInternal` +
  `requireManagerRole` on **every** route including reads, stricter than
  Materials. PO status: only `Draft -> Ordered` and `-> Cancelled` are
  settable directly (`PATCH /purchase-orders/:id/status`); `Partially
  Received`/`Received` are derived automatically by
  `POST /purchase-orders/:id/receive` from actual item totals, never
  caller-set — the 409 guard exists for both endpoints.
- `/api/practices/:id/contracts` and `/notes` — both `requireManagerRole`,
  internal-only, mounted on `practices.routes.js` alongside the existing
  (Session 4) fee-schedule route on the same resource. No visibility split
  on notes (contrast with case notes) — nothing here is ever client-visible.

**What's built:**

- `lib/caseTypes.ts` — full type coverage: `MaterialCategory`/`Material`/
  `MaterialStockTransaction`, `Vendor`/`PurchaseOrder`/`PurchaseOrderItem`,
  `PracticeContract`/`PracticeNote`, plus every List/Create/Update/Response
  and payload type, each block documenting exactly which controller/route
  file it was confirmed against and the casing correction above.
- `lib/api.ts` — `listMaterialCategories`/`createMaterialCategory`,
  `listMaterials`/`getMaterial`/`createMaterial`, `listStockTransactions`/
  `consumeMaterial`/`adjustMaterial`, `listVendors`/`createVendor`,
  `listPurchaseOrders`/`getPurchaseOrder`/`createPurchaseOrder`/
  `updatePurchaseOrderStatus`/`receivePurchaseOrder`,
  `listPracticeContracts`/`createPracticeContract`,
  `listPracticeNotes`/`createPracticeNote`.
- `lib/statusColors.ts` — `MATERIAL_STATUS_COLORS`, `PO_STATUS_COLORS`.
  Reuses existing `--pill-*`/`--badge-*` tokens exclusively (no new colors
  invented), same rule every prior session's status-color map followed.
- `components/MaterialStatusPill.tsx`, `components/POStatusPill.tsx` — same
  one-line shape as `InvoiceStatusPill.tsx`.
- `components/NewMaterialModal.tsx` — category select with an inline
  "+ new category" toggle (no standalone category-management screen in this
  session's scope), name/unit/unit cost/reorder threshold/optional initial
  stock.
- `components/StockTransactionModal.tsx` — Consume/Adjust via the reused
  `.range-toggle`/`.range-btn` pattern. Adjust tab is hidden client-side for
  non-manager roles, mirroring `requireManagerRole` on that one sub-action.
- `components/NewVendorModal.tsx`, `components/NewPurchaseOrderModal.tsx`
  (material line items, same shape as `NewInvoiceModal`'s line-item array),
  `components/ReceivePOModal.tsx` (only shows items with remaining
  quantity; backend independently re-validates every amount).
- `components/NewContractModal.tsx` — payment terms/credit limit/start-end
  dates; `salesRepId` left unset (no staff picker in this session's scope).
- `pages/MaterialsPage.tsx` (category + low-stock filters via
  `.range-toggle`), `pages/MaterialDetailPage.tsx` (stock summary cards +
  full transaction history table + record-transaction action).
- `pages/PurchaseOrdersPage.tsx` (Vendors/POs tabbed, same
  `.range-toggle` tab pattern), `pages/PurchaseOrderDetailPage.tsx` (items
  table, manual status transitions gated to the only-legal ones, Receive
  action).
- `pages/PracticesPage.tsx` (list), `pages/PracticeDetailPage.tsx`
  (Contracts/Notes tabs — no visibility toggle on notes since practice
  notes have no client-facing side at all).
- `lib/navConfig.ts` — `materials` flipped to `live: true`; added
  `procurement` (`/purchase-orders`, label "Vendors & POs") and
  `practices` (`/practices`) nav items, both gated to
  `['owner', 'office_manager']` matching `requireManagerRole` on their
  underlying write routes.
- `layouts/AppShell.tsx` — added `procurement` (truck/dolly) and
  `practices` (building) icon paths, same stroke-icon style as the rest of
  the set (viewBox 0 0 24 24, stroke currentColor).
- `App.tsx` — routes wired for `/materials`, `/materials/:id`,
  `/purchase-orders`, `/purchase-orders/:id`, `/practices`,
  `/practices/:id`. Auto-stub loop already skips these since `live: true`.

**Verified:**

- `npx tsc -b` and `npm run build` — both clean, zero errors, on a fresh
  `npm install` baseline in this environment.
- Grepped every new component's import outside its own file
  (`MaterialsPage`, `MaterialDetailPage`, `PurchaseOrdersPage`,
  `PurchaseOrderDetailPage`, `PracticesPage`, `PracticeDetailPage`,
  `MaterialStatusPill`, `POStatusPill`, `NewMaterialModal`,
  `StockTransactionModal`, `NewVendorModal`, `NewPurchaseOrderModal`,
  `ReceivePOModal`, `NewContractModal` — all fourteen confirmed imported
  and used somewhere other than their own file) — the exact Session 2
  checklist item this project keeps re-running.

**Not verified (be honest about this, same standard as every prior
session):**

- No runnable Postgres/backend in this environment — §6 rule 3 ("actually
  click through it in a running browser against the real backend") has
  **not** been satisfied yet.
- Visual audit against the reference demo (`index.html`): same situation as
  Sessions 3/4/5 — the demo has no Materials/Procurement/Practices CRM
  screens to compare against. Confirmed every class/token used here
  (`.surface-card`, `.range-toggle`/`.range-btn`, `.form-input`,
  `.btn-primary`, `.status-pill`, `.empty-state`, `.skeleton`,
  `.modal-overlay`/`.modal-box`) was already ported and verified in a prior
  session, not reinvented.

**Delivered as two zips** (per the person's explicit request, after two
prior sessions were lost before delivering a file):

1. `armature-labs-session6-part1-foundation.zip` — `lib/caseTypes.ts`,
   `lib/api.ts`, `lib/statusColors.ts`, and all 8 new `components/*.tsx`
   files. Self-contained but not yet wired into the app (no routes, no nav)
   — applying only this part leaves the code present but unreachable,
   same shape as the Session 2 mistake, deliberately, as an intermediate
   checkpoint.
2. `armature-labs-session6-part2-pages-and-wiring.zip` — all 6 new
   `pages/*.tsx` files, plus the modified `lib/navConfig.ts`,
   `layouts/AppShell.tsx`, `App.tsx`, and this log file. Depends on part 1
   already being applied. Once both parts are applied, the app is fully
   wired — this is the point equivalent to "session done" everywhere else
   in this log.

**How to pick this up:**

1. Unzip part 1, then part 2, over the branch (or apply both to a fresh
   clone of `main` @ `87ab027`). Confirm `npm run build` still clean in the
   real Codespace.
2. Do the click-through this log can't do here: `npm run dev` both sides,
   log in as `owner@dentallab.test`. Materials: create a category inline,
   create a material with an initial stock, consume some, adjust some
   (confirm Adjust is hidden for a non-manager login), confirm the
   transaction history table updates. Procurement: create a vendor, create
   a PO against a material, mark it Ordered, receive a partial quantity,
   confirm status flips to "Partially Received" automatically, receive the
   rest, confirm it flips to "Received" and the Receive button disappears.
   Practices: open an existing practice, add a contract, add a note,
   confirm both tabs render. Log in as a non-manager internal role and
   confirm procurement/practices nav items are absent, Adjust is hidden on
   Materials.
3. Once confirmed, Session 6 is fully closed. Session 7 (saved
   reports/dashboards, equipment + technician scheduling) is next for
   frontend — its backend is already complete per `BUILD_LOG.md`'s Session
   7 entry (174/174 tests, commit `a32fd77`).

**Update — click-tested live (post-delivery verification):** Materials,
Procurement, and Practices all confirmed working against the real
running backend, not just build-clean. Verified directly: created and
persisted a real practice contract (Net 30 / $5000) on Bright Smile
Dental Clinic, confirmed it renders back correctly. Confirmed
Procurement's PO status transitions (Draft→Ordered→Received, and
Cancelled) already exercised and visible in the live data. Confirmed
Materials/Procurement/Practices list and detail pages all load and
render correctly with real data, not stubs. Role-gating confirmed by
logging in as both `owner@dentallab.test` and `tech1@dentallab.test`:
Procurement and Practices nav items are correctly absent for Assistant
Technician, "Adjust" is correctly hidden on Material detail (only
"Record transaction" shows), "+ New material" is correctly hidden.
Backend `npm test` independently re-run inside the `armature-labs-backend-1`
container (not the host, which fails on `DATABASE_URL` resolution):
193/193 passing, 18/18 suites — matches `BUILD_LOG.md`'s Session 9 claim
exactly. Session 6 is now fully closed per §6's own definition of done,
not just code-complete.

**Update — click-tested live (post-delivery verification):** Materials,
Procurement, and Practices all confirmed working against the real
running backend, not just build-clean. Verified directly: created and
persisted a real practice contract (Net 30 / $5000) on Bright Smile
Dental Clinic, confirmed it renders back correctly. Confirmed
Procurement's PO status transitions (Draft→Ordered→Received, and
Cancelled) already exercised and visible in the live data. Confirmed
Materials/Procurement/Practices list and detail pages all load and
render correctly with real data, not stubs. Role-gating confirmed by
logging in as both `owner@dentallab.test` and `tech1@dentallab.test`:
Procurement and Practices nav items are correctly absent for Assistant
Technician, "Adjust" is correctly hidden on Material detail (only
"Record transaction" shows), "+ New material" is correctly hidden.
Backend `npm test` independently re-run inside the `armature-labs-backend-1`
container (not the host, which fails on `DATABASE_URL` resolution):
193/193 passing, 18/18 suites — matches `BUILD_LOG.md`'s Session 9 claim
exactly. Session 6 is now fully closed per §6's own definition of done,
not just code-complete.

## Session 7 (Chunk 1 of 2) — Dashboard retrofit (§0.1 + §0.2), IN PROGRESS

Delivered as a **standalone, self-contained chunk** per `SESSION_7_PROMPT.md`
§3's own suggested build order — this chunk doesn't depend on the reports/
equipment/scheduling work in Chunk 2, and is delivered separately so a
tool-budget cutoff mid-Chunk-2 doesn't lose Chunk 1's already-finished,
already-build-clean work. Chunk 2 (saved reports + 3 charts, equipment,
technician scheduling) is a separate delivery.

**Two confirmed gaps closed this chunk (per the prompt's own §0):**

1. **§0.1 — "Action required queue" panel, never built (Session 3 scope,
   silently dropped).** New `components/ActionRequiredQueue.tsx`. Data:
   pending approvals from `GET /api/approvals?status=pending` (same
   endpoint the notification bell already uses, confirmed against
   `AppShell.tsx`) combined with cases in `Delayed` / `Case on Hold`
   status pulled from the case list already fetched for the other
   dashboard cards. No new backend endpoint invented, per the prompt's
   explicit instruction. Client-side text filter (case number, patient,
   practice, status), same "no backend search param" precedent already
   established for Case Queue's search box.
2. **§0.2 — hero "Case Snapshot" card + tooth animation + "Today's
   workflow" stepper, never ported from the demo.** New
   `components/CaseSnapshotHero.tsx` (real most-recently-updated
   in-progress case, real stage % derived from the case's position in
   the actual 8-step `LINEAR_STATUSES` list, tooth SVG mark copied
   verbatim from `LoginPage.tsx`'s existing path rather than a new asset)
   and `components/TodaysWorkflowPanel.tsx` (real aggregate counts per
   pipeline stage, documented mapping decision below). The four
   `MetricCard`s on `DashboardPage.tsx` now read real computed values
   instead of the hardcoded `14`/`3`/`5`/`1`.

**New file:** `lib/dashboardMetrics.ts` — pure aggregation functions
(`fetchAllCasesForDashboard`, `computeDashboardMetrics`, `pickHeroCase`,
`stagePercent`, `computeTodaysWorkflow`, `buildExceptionQueueItems`), kept
separate from `DashboardPage.tsx` so the mapping decisions below are
readable/testable on their own.

**Documented decisions (record here, not silently guessed):**

- **No dedicated dashboard-aggregate backend endpoint exists.**
  `fetchAllCasesForDashboard` pages through the real `GET /api/cases`
  (capped at 100/page server-side) up to 5 pages (500 cases) as a safety
  valve appropriate for this lab's real scale. If case volume ever grows
  past that, these aggregates will under-count — flagging this now as a
  known limitation for a future dedicated backend aggregate endpoint,
  not silently guessing it'll never matter.
- **"Today's workflow" stepper mapping.** The backend's real 10-status
  lifecycle (`caseStatus.js`) has no distinct "Scanning" sub-status —
  its own comment confirms intake/scanning is an internal sub-step of
  "Case Entered," not a separate status. Mapped: Received = every case
  ever created; Scanning = cases currently in "Case Entered"; Design =
  "In Design"; Approval = "Pending Design Approval" + "Pending Bisque
  Approval"; Printing = "Processing" + "Finalizing"; Shipping = "Shipped
  Out". "Delivered" excluded from every bucket (terminal, not part of
  today's active pipeline).
- **Hero card "Material" field has no real backend equivalent.**
  Confirmed via `backend/migrations/` — no `material_id` column on
  `cases`; materials belong to inventory (Session 6), not linked to
  cases directly. Substituted the case type name (`GET
  /api/reference/case-types`) instead of inventing a fake material
  value. Similarly substituted "Assignment: Assigned/Unassigned" (real
  `assigned_staff_id` presence) for the reference's "Printer" field,
  since there's no printer-assignment field on `cases` either.
- **Hero card selection logic:** most recently updated (`updated_at`
  desc) case not in `Delivered` status — not a hardcoded "pick case #1"
  shortcut, confirmed reasonable against `GET /api/cases`'s real fields
  before building, per the prompt's explicit instruction.

**Known side effect, flagged rather than silently left:**
`components/WorkflowTracker.tsx` (the old Session 1 mock-data pipeline
component) is no longer imported anywhere now that `DashboardPage.tsx`'s
`EXAMPLE_STEPS` usage is gone — confirmed via `grep -rn "WorkflowTracker"`.
It was never wired into `CaseDetailPage.tsx` either (checked directly —
that page renders `currentStage` differently, not via this component).
This is now genuinely dead code, not code this chunk introduced but a
pre-existing gap this chunk's removal exposed. Not deleting it and not
guessing where to wire it in without confirming intent first — flagging
as an open item for a future session (most likely retrofitting it into
`CaseDetailPage.tsx`'s per-case view, which is the shape of data it
actually renders) rather than silently leaving it unexplained.

**Verified this chunk:**

- `npx tsc -b` and `npm run build` — both clean, zero errors, fresh
  `npm install` baseline in this environment.
- Grepped every new component's import outside its own file
  (`CaseSnapshotHero`, `TodaysWorkflowPanel`, `ActionRequiredQueue` — all
  three confirmed imported and used in `DashboardPage.tsx`, not just
  present on disk) — the exact Session 2 checklist item this project
  keeps re-running.
- `npx oxlint` — 0 errors (2 pre-existing warnings on `AuthContext.tsx`/
  `ToastContext.tsx`, unrelated to this chunk).

**Not verified (be honest, same standard as every prior session):**

- No runnable Postgres/backend in this environment — §6 rule 3 ("actually
  click through it in a running browser against the real backend") has
  **not** been satisfied yet for this chunk.
- Visual comparison against the reference demo was done by direct markup
  inspection (`index.html`'s hero card / workflow stepper / action queue
  sections read line-by-line) and cross-checked against classes already
  defined in `index.css` (`.hero-tooth-wrap`, `.wf-dot`, `.wf-connector`,
  `.status-pill`, `.empty-state`, `.form-input`) — not a live pixel
  screenshot diff, since there's no browser in this environment either.

**How to pick this up:** `npm run dev` both sides, log in, confirm the
hero card shows a real in-progress case (not example data) and clicking
it navigates to `/cases/:id`, the tooth mark renders and floats, "Today's
workflow" shows real counts, the four metric cards show real numbers, and
the Action Required Queue lists real pending-approval + delayed/on-hold
cases with a working filter input and click-through to the case. Then
proceed to Chunk 2 (saved reports + 3 charts, equipment, technician
scheduling) — separate delivery, per `SESSION_7_PROMPT.md` §3's chunk 2/3.

## Session 7 (Chunk 2 of 3) — Saved reports + 3 charts (§1.1)

Second of the three chunks in `SESSION_7_PROMPT.md` §3's suggested build
order. Depends on nothing from Chunk 1 (Dashboard retrofit) — built and
verified independently, applied on top of Chunk 1 in this environment
only to confirm no conflicts, not because of a real dependency. Chunk 3
(equipment + technician scheduling, §1.2) is a separate delivery still to
come.

**Confirmed before writing any code, not guessed:**

- `backend/src/controllers/reports.controller.js` — `saved_reports` is
  create/list/delete only. No "generate" verb exists anywhere in the
  controller. This matches the Master Frontend Plan's own §1.1
  instruction ("they're views, not separate storage... don't build a
  report screen that expects its own writable dataset") — confirmed
  directly against the real controller, not assumed from that
  instruction's wording alone.
- `frontend/package.json` has no charting library installed (no
  `recharts`, no Chart.js) — confirmed by reading it directly before
  adding anything. Built dependency-free SVG chart components instead of
  adding a new package to a drop-in patch delivery; matches this
  codebase's own established convention of hand-rolled inline SVG for
  icons/marks (`LoginPage.tsx`'s tooth path, `icons.svg`) rather than
  pulling in an external chart library for three charts.
- `backend/src/controllers/approvals.controller.js` — `responded_at` is
  only set on approve/request-changes (`null` while pending), confirmed
  via its own `UPDATE` statements. Response-time math excludes pending
  rows rather than treating them as 0-hour responses.
- `GET /api/cases`'s `practice_id` + `created_at` and `GET /api/practices`
  confirmed as the real join needed for "top practices by volume" — no
  dedicated backend aggregate for this either.

**New files:**

- `lib/reportTypes.ts` — `SavedReport` type + list/create response shapes.
  Kept separate from `caseTypes.ts` (already 60+ exported names) rather
  than bloating that file further with an unrelated resource.
- `lib/api.ts` — added `listSavedReports` / `createSavedReport` /
  `deleteSavedReport`, same `apiFetch` wrapper convention as every other
  resource in this file.
- `lib/reportMetrics.ts` — pure aggregation functions, no mock data,
  same discipline as `dashboardMetrics.ts`:
  - `casesByStatus` — real counts per the 10-status lifecycle, stable
    ordering (`ALL_STATUSES`) so the donut's legend doesn't reshuffle.
  - `fetchApprovalsForRange` / `approvalResponseTimeSeries` — pages
    through real `GET /api/approvals` rows (stops early once a page's
    oldest row is past the range cutoff, since the endpoint's own
    `ORDER BY created_at DESC` makes that safe), buckets
    `responded_at - created_at` in hours per the 7D (daily) / 6W (weekly)
    / 90D (15-day) range, matching the reference demo's own range-toggle
    granularity.
  - `topPracticesByVolume` — cases with `created_at` in the last 30 days,
    grouped by `practice_id`, joined to real practice names, top 8.
- `components/DonutChart.tsx`, `LineChart.tsx`, `BarChart.tsx` — generic,
  reusable, dependency-free SVG chart components. Donut supports the
  reference's own "click a segment to isolate it" behavior (also
  click-able from the legend, not just the arc itself).
- `components/SavedReportModal.tsx` — create-only form (matches the
  backend's real verbs). Revenue-type option hidden for non-Owner/Office
  Manager roles client-side, mirroring `reports.controller.js`'s own
  `assertRevenueAllowed` — cosmetic convenience, the 403 is the real gate.
- `pages/ReportsPage.tsx` — saved reports list (create/delete, wired to
  the toast pattern used everywhere else) + all three charts. The line
  chart's range toggle re-fetches and re-buckets independently of the
  page's core load, so switching 7D/6W/90D doesn't re-run the cases/
  practices/saved-reports fetch.

**Wiring:** `App.tsx` gets a real `/reports` route (ahead of the generic
stub-route block that auto-generates `ComingSoon` pages for any nav item
without `live: true`); `navConfig.ts`'s `reports` entry flipped to
`live: true`. No `ComingSoon` stub reachable for this path anymore.

**Verified this chunk:**

- `npx tsc -b` and `npm run build` — both clean, zero errors, fresh
  `npm install` baseline in this environment. (Two pre-existing `oxlint`
  warnings on `AuthContext.tsx`/`ToastContext.tsx`'s fast-refresh export
  shape — unrelated to this chunk's files, not introduced here.)
- Grepped every new file (`reportTypes`, `reportMetrics`, `DonutChart`,
  `LineChart`, `BarChart`, `SavedReportModal`, `ReportsPage`) for at least
  one import outside its own file — all wired, no Session-2-shaped dead
  code.

**Not yet done — same open item as every chunk built in this sandbox:**
no live Postgres/browser here, so this is build-verified only. The real
click-through this needs before Session 7 can be called done: create a
saved report and confirm it persists/lists/deletes; confirm the donut
renders real per-status counts and segment-click isolation actually
narrows the center total; confirm the line chart's 7D/6W/90D toggle
visibly changes the plotted data (not just re-renders the same numbers);
confirm the bar chart's practice names and counts match real recent
cases; log in as a non-Owner/non-Office-Manager internal role and confirm
the Reports nav item is absent (not just disabled).

**How to pick this up:** `npm run dev` both sides, log in as
`owner@dentallab.test`, click Reports in the sidebar (not by typing the
URL). Create a saved report of each type available, confirm the list
updates and delete works. Exercise the donut (click a segment, click it
again to un-isolate), toggle the line chart's three ranges, confirm the
bar chart against a few real cases' `created_at` dates. Then proceed to
Chunk 3 (equipment + technician scheduling, §1.2) — separate delivery,
independent of this chunk per `SESSION_7_PROMPT.md` §3.

## Session 7 (Chunk 3 of 3) — Equipment + technician scheduling (§1.2)

Final chunk of Session 7 per `SESSION_7_PROMPT.md` §3. Independent of
Chunk 2 (built regardless of chunk order, per the prompt's own note).
With this chunk, all three Session 7 chunks (§0.1/§0.2 dashboard retrofit,
§1.1 reports/charts, §1.2 equipment/scheduling) are code-complete.

**Confirmed before writing any code:**

- `equipment.controller.js` — catalog create/status-update is
  `requireManagerRole`; reads and maintenance-log creation are open to any
  internal staff (route file's own comment: a technician servicing a
  machine shouldn't need a manager to log it). Gated the UI to match
  exactly — status dropdown only rendered for Owner/Office Manager on the
  detail page, "Log maintenance" open to all.
- `planning.controller.js` — both shifts and bookings do real
  check-then-insert-in-a-transaction overlap prevention and return a real
  `409` on conflict (not a generic 500) — verified the message is
  surfaced as-is in both new-shift/new-booking modals' error banner, not
  swallowed into a raw error.
- `planning.routes.js` — both routes sit at `requireInternal` only, no
  extra manager gate ("closer to day-to-day scheduling... kept at that
  floor"). Nav item and create actions gated accordingly — any internal
  role can create shifts/bookings, not just managers.
- `listShifts`/`listBookings` return a flat array ordered by `starts_at`,
  no date-range query params. Per the prompt's own instruction to confirm
  calendar-vs-list before committing to a UI: built as a simple
  upcoming/past list, not a calendar grid — a calendar would need
  date-bucketing invented client-side with no backend signal for it.

**Confirmed gap, flagged rather than guessed around:** no backend route
returns `technicians.id` paired with a technician's display name.
`GET /api/users` (manager-only) returns `users.id` + `full_name`, but
`technician_shifts.technician_id` is a foreign key into the separate
`technicians` table, and no `GET /api/technicians` (or equivalent) exists
anywhere in `backend/src/routes/`. Rather than invent a new backend
endpoint (against this project's own standing rule) or silently assume a
1:1 `users.id === technicians.id` mapping (it isn't — `technicians.id` is
its own serial column), the new-shift form takes a plain numeric
technician ID with an explicit note explaining why. **This is a real
open item for a future backend session, not a frontend shortcut** — a
`GET /api/technicians` endpoint joining to the user's name would close
it cleanly.

**New files:**

- `lib/equipmentTypes.ts` — `Equipment`, `MaintenanceLog`,
  `TechnicianShift`, `EquipmentBooking` types + all six response shapes.
  Kept separate from `caseTypes.ts`, same reasoning as Chunk 2's
  `reportTypes.ts`.
- `lib/api.ts` — added `listEquipment` / `getEquipmentItem` /
  `createEquipmentItem` / `updateEquipmentStatus` / `listMaintenanceLogs`
  / `createMaintenanceLog` / `listShifts` / `createShift` /
  `listBookings` / `createBooking`.
- `lib/statusColors.ts` — `EQUIPMENT_STATUS_COLORS` (Active → green,
  Under Maintenance → amber, Retired → tan), reusing the existing tone
  families rather than inventing new ones.
- `components/EquipmentStatusPill.tsx` — copied `POStatusPill.tsx`'s
  exact pattern.
- `components/NewEquipmentModal.tsx` — manager-only catalog creation.
- `components/MaintenanceLogModal.tsx` — open to all internal staff;
  `nextDueDate` left optional/blank-safe per the controller's own
  documented bugfix (an empty value must NOT overwrite an existing future
  due date).
- `components/NewShiftModal.tsx` / `NewBookingModal.tsx` — create forms
  with real 409-conflict surfacing. Booking's case picker is a real
  `GET /api/cases` page (fully resolvable, unlike the technician-ID gap
  above); equipment picker reuses `SchedulingPage`'s already-loaded
  equipment list.
- `pages/EquipmentPage.tsx` — list + status filter, mirrors
  `MaterialsPage.tsx`'s structure exactly.
- `pages/EquipmentDetailPage.tsx` — status change (manager-gated) +
  maintenance log history, mirrors `MaterialDetailPage.tsx`.
- `pages/SchedulingPage.tsx` — tabbed shifts/bookings, each split into
  upcoming/past (client-side only, not re-sorted — both lists are already
  ordered `starts_at ASC` server-side).

**Wiring:** `App.tsx` gets real `/equipment`, `/equipment/:id`,
`/scheduling` routes. `navConfig.ts`'s `equipment` entry flipped to
`live: true`; new `scheduling` nav item added (new `NavIconKey` +
matching stroke-icon in `AppShell.tsx`, same viewBox/stroke-width
convention as every other nav icon). Neither path is reachable via the
generic `ComingSoon` stub route anymore.

**Verified this chunk:** `npx tsc -b`, `npm run build`, and `npx oxlint`
all clean (same two pre-existing, unrelated context-file warnings as
every prior chunk). Every new file grepped for at least one import
outside itself — all wired.

**Not yet done — same standing item as every chunk built in this
sandbox:** no live Postgres/browser here, build-verified only. Real
click-through still needed: create equipment, log maintenance, confirm
it appears and (if a `nextDueDate` was given) the equipment's own due
date updates; change equipment status as a manager and confirm a
non-manager can't; create a technician shift and confirm a genuinely
overlapping second shift for the same technician surfaces the real 409
message, not a raw error; same for equipment bookings; confirm a
non-manager can still create equipment/scheduling records (creation
isn't manager-gated) but cannot create/edit the equipment catalog itself
or change an equipment's status.

**Session 7 status:** all three chunks (dashboard retrofit, reports/
charts, equipment/scheduling) are code-complete and build-verified. Full
Session 7 close-out per the prompt's definition-of-done §4 still needs
the live click-through pass across all three chunks together — that's
the one item every chunk in this sandbox has consistently deferred to
whoever runs it against the real, running stack next.

## Session 7 Hotfix — Dashboard metric cards stuck at 0, "Invalid Date" on hero card

Found via live click-through against the real deployed Codespace (not
this sandbox's build-only checks) — two real, confirmed bugs, both fixed.

**Bug 1 — all four MetricCards showed 0 despite real non-zero data.**
Confirmed root cause: `lib/useCountUp.ts`'s animation effect had a
`startedRef` one-shot guard that made it run exactly once, at whichever
`target` the component *first* mounted with. `DashboardPage` mounts with
`metrics` at its `{0,0,0,0}` initial state while the real fetch is still
in flight; once the fetch resolves and `target` changes to the real
number, the guard skipped re-running the effect, so the displayed value
froze at 0 permanently. This was invisible with Session 1's old hardcoded
constants (14/3/5/1 never changed after mount, so the bug never
triggered) — Chunk 1's real async-loaded data exposed it for the first
time. Fixed by removing the one-shot guard so the effect re-runs (and
re-animates) whenever `target` actually changes.

**Bug 2 — hero card's "Due" field showed "Invalid Date".** Confirmed root
cause against the backend, not guessed: `backend/migrations/0006_cases.js`
defines `due_date` as a `date` column, but `cases.controller.js`'s SELECT
never casts it `::text` the way `equipment.controller.js` does for its
own date columns — that controller's own header comment already flags
this exact bug class and names `accounts.controller.js`'s
`contract_start_date` as one instance; `cases.controller.js`'s `due_date`
is a second, previously uncaught one. Without the cast, it serializes as
a full ISO timestamp (`"2026-08-06T00:00:00.000Z"`), not the bare
`YYYY-MM-DD` `caseTypes.ts`'s own comment and every consumer assumed.
`${dueDate}T00:00:00` on an already-full-ISO string produces an
unparseable string → `Invalid Date`.

This is a backend Session 2 bug, out of Session 7's scope to fix
server-side (documented here, not silently patched in `cases.controller.js`
without being asked) — but every frontend consumer of `due_date` is now
robust to either shape via a new `lib/dateUtils.ts::parseFlexibleDate()`
helper:
- `CaseSnapshotHero.tsx`'s `formatDueLabel` — no more "Invalid Date";
  falls back to "No due date" only if parsing genuinely fails.
- `dashboardMetrics.ts`'s `dueThisWeek` calculation — was silently
  under-counting to 0 for every case with a full-ISO `due_date` for the
  same reason.
- `pages/CaseQueuePage.tsx`'s Due column — opportunistic fix, found while
  investigating the hero card bug: it was rendering the raw ISO timestamp
  string unformatted (visible directly in the live screenshot). Session 2
  pre-existing issue, not introduced this session, fixed here rather than
  left broken now that the root cause was already diagnosed.
- `caseTypes.ts`'s `due_date` field comment corrected to reflect the
  confirmed real shape.

**Recommended backend follow-up (not done here, flagged only):** add
`due_date::text AS due_date` to `cases.controller.js`'s SELECT, matching
`equipment.controller.js`'s own established pattern for this exact
problem. Once that lands, `parseFlexibleDate`'s ISO-timestamp branch
becomes dead code for this field specifically (harmless to leave — it's
a defensive parse, not a footgun) but the frontend doesn't need to change
either way.

**Verified:** `npx tsc -b`, `npm run build`, `npx oxlint` all clean.
`parseFlexibleDate` confirmed imported and used in all 4 real consumer
files. Not yet re-verified against the live Codespace by me directly —
next click-through should confirm both fixes (metric cards animate to
real non-zero numbers; hero card's Due field shows a real relative label
or date instead of "Invalid Date"; Case Queue's Due column shows a
formatted date).

---

## Session 5.5 — Patients tab + invoice due date/tax/paid display

**Confirmed live before building, per this project's own §0 rule.** Ran
the real backend against a fresh local Postgres (not previously possible
in this sandbox — installed Postgres directly, migrated + seeded), then
curl'd `GET/POST/PATCH /api/patients` and a real invoice response
directly rather than trusting the prompt's guessed shapes. Both matched:
`patients`/`patient` camelCase wrappers over snake_case rows
(`id, practice_id, first_name, last_name, created_at`, ids as strings);
invoices now genuinely return `due_date`/`tax_amount`/`paid_date` as of
the same-day backend fix (see `BUILD_LOG.md`'s 2026-07-28 addendum) —
confirmed the backend fix had actually landed before starting §2, per
this prompt's own hard prerequisite.

**§1 — Patients tab.** Added to `PracticeDetailPage.tsx` as a third tab
alongside Contracts/Notes (not a standalone `/patients` nav item — per
the client-spec doc, patients are practice-scoped). List, inline
"Add patient" form (firstName/lastName only — no other fields exist on
`createPatientSchema`), and inline edit (click a row's Edit link → two
text inputs → Save/Cancel), all confirmed against the running API rather
than guessed. Gating matches `patients.routes.js` exactly: internal staff
always allowed; `dentist_client` requires `can_edit_patient_info`
(`user.canEditPatientInfo` — confirmed via grep this was its first real
consumer; the only other reference in the whole frontend was a raw debug
dump in `DashboardPage.tsx`, not a real usage).

Types (`Patient`, `ListPatientsResponse`, `GetPatientResponse`,
`CreatePatientPayload`/`Response`, `UpdatePatientPayload`/`Response`) and
API functions (`listPatients`/`getPatient`/`createPatient`/
`updatePatient`) added to `caseTypes.ts`/`api.ts` following this file's
existing conventions exactly (camelCase wrapper keys, snake_case row
fields, no aliasing — same as every other resource here).

**Known, flagged exception to this project's own "every new api.ts
function must be called somewhere" rule:** `getPatient` has no call site.
It was added for shape-parity with every other resource in this file
(each has a get-by-id function), per the build prompt's explicit
instruction — but there's no standalone patient-detail view in this
session's scope (patients aren't a nav-level resource, and inline edit
works off the already-loaded list row, so nothing needs to re-fetch a
single patient by id). Documented here rather than silently left, or
force-added a fake call site just to satisfy the check. `GetPatientResponse`
is likewise currently unused for the same reason. Not a Session 2-style
bug (nothing is unreachable in the running app) — just a currently-unused
convenience function.

**§2 — Invoice due date / tax / paid date display.**
- `InvoiceDetailPage.tsx`: added a 4th stat card ("Due", alongside
  Subtotal/Amount paid/Balance due — grid changed from 3 to 4 columns,
  responsive `sm:grid-cols-2 lg:grid-cols-4`), rendering "No due date"
  for `null` rather than a blank or crash. `paid_date` shown inline next
  to the status pill, only when `status === 'Paid'`. When
  `tax_amount > 0`, a distinct Subtotal → Tax → Total breakdown appears
  under the line items (folded away entirely when tax is 0, so existing
  zero-tax invoices look unchanged).
- `InvoicesPage.tsx`: added a "Due" column to the list table, same
  null-safe "No due date" rendering.
- `NewInvoiceModal.tsx`: added an optional `<input type="date">` for due
  date and a tax-amount number field, sent as `dueDate`/`taxAmount` in
  `CreateInvoicePayload` (both `undefined` when left blank — matches the
  backend's own optional-with-default-0 schema). Live subtotal+tax=total
  preview shown only when tax is entered.
- All three date fields reuse `parseFlexibleDate()` from `lib/dateUtils.ts`
  (the Session 7 hotfix helper) rather than assuming a bare `YYYY-MM-DD`
  shape — confirmed via curl that `due_date`/`paid_date` come back as full
  ISO datetime strings, same ambiguity as `CaseRecord.due_date` already
  has, exactly the class of bug that helper exists to absorb.
- **Known, pre-existing, not introduced here:** "Balance due" still
  compares `amount_paid` against `subtotal` only, not `subtotal + tax`,
  because that's what the backend's own Paid-status transition logic
  does (flagged in the same-day `BUILD_LOG.md` addendum as a business-logic
  decision nobody's made yet). The frontend's Total line is informational
  only — it does not change what "Balance due" or "Paid" mean here.

**Definition of done:**
- `npx tsc -b`, `npm run build`, `npx oxlint` all clean (oxlint's 2
  warnings are pre-existing, in `AuthContext.tsx`/`ToastContext.tsx`,
  files this session didn't touch).
- Grep-confirmed every new `api.ts` function is called somewhere, except
  the one documented exception above (`getPatient`).
- No new nav item added (Patients tab lives inside `PracticeDetailPage.tsx`,
  matches the existing Contracts/Notes pattern — confirmed this was the
  right reading of the client-spec doc before building, not the
  standalone-`/patients`-page fallback).
- **Live click-through still isn't possible in a sandbox without a
  persistent Postgres attached to a real browser session** — same honest
  caveat Sessions 3/4/7/8 carried. What is different this time: the
  backend side of this was actually run against a real local Postgres and
  curl-verified end-to-end (not just build-checked), so the API contract
  this UI was built against is confirmed-real, not assumed. The UI layer
  itself is build-verified only; next session with browser access should
  confirm the Patients tab and the four invoice-field changes render and
  submit correctly against a live login.
