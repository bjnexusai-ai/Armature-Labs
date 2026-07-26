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
