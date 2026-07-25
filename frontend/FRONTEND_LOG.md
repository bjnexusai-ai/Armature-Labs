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

- Session 2: real case queue / case detail / New Case form (currently a stub).
- Session 3: approvals UI.
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
5. Confirm `GET /api/cases` response casing against a real call (curl or
   browser devtools) BEFORE starting Session 2's case queue UI — this is
   flagged as unconfirmed in the Wiring Prompt and is the single most
   important verification step before writing any table-render code.
6. Read this file's "Not yet built" section, pick up at Session 2.
7. Commit + push before ending the session — update this log first.
