# Armature Labs — Master Frontend Plan

> **Amended:** added two standing conventions after Session 2 was found to
> have shipped incomplete — pages existed on disk but were never routed,
> never added to nav, and never had their API functions written, with no
> `FRONTEND_LOG.md` entry to flag it. See §3 for the added rules. Session 2
> itself has since been fixed and its log entry corrected.

**Origin note:** the backend has `Armature_Labs_Master_Session_Plan.md` (9 sessions).
That doc explicitly excludes frontend/portal UI from all 9 backend sessions. This is
the companion doc for the frontend side — same spirit, same numbering, one step
behind the backend since UI work needs live endpoints to wire against, not guessed
ones.

**Not covered here:** wiring the existing demo `index.html` (login + dashboard) to
the Session 1-2 backend. That's already fully specified in
`Armature_Labs_Frontend_Wiring_Prompt.md` — treat it as **Session 0**, pre-work that
either already happened or happens first, not duplicated in this doc.

---

## 1. The 9-Session Plan

| # | Depends on (backend) | Scope |
|---|---|---|
| 0 | Backend S1-2 | *(separate doc)* Wire demo `index.html` — login, case queue table, case detail modal, New Case form — to live endpoints |
| 1 | Backend S1 | Real React + TypeScript + Tailwind app shell: routing, auth screens, JWT/session handling, role-based nav (Owner / Office Manager / Assistant-Technician / Designer / Dentist portal) |
| 2 | Backend S2 | Production case list/queue, case detail view, New Case form, 10-status display — the "real" version of what Session 0's demo wiring proved out |
| 3 | Backend S3 | Approval UI — design/bisque Approve / Request Changes actions, notification bell + toasts |
| 4 | Backend S4 | Invoice list/detail (manual mark-paid only, no Stripe yet), QC checklist UI |
| 5 | Backend S5 | Messages (internal vs client-visible), progress photo gallery, shipment tracking, warranty claims |
| 6 | Backend S6 | Materials/inventory screens, vendor/PO views, practice CRM (contracts/notes) |
| 7 | Backend S7 | Saved reports/dashboards, equipment + technician scheduling views |
| 8 | Backend S8 | Stripe Checkout UI, both directions (dental office→lab, lab→manufacturer) — flag as a scope delta on the frontend too, same as backend |
| 9 | Backend S9 | Full integration + responsive/accessibility pass, permission-gating audit, token-storage hardening review |

**What's explicitly NOT in this list:** the React Native mobile app (separate track,
mirrors the portal once it's stable per the build order) and any backend work.

---

## 2. How to Proceed as Each Backend Session Lands

Don't start a frontend session just because the table above says it's "next" —
confirm the backend session actually landed first. For each:

**Backend Session 1 lands (auth, RBAC) →**
1. Confirm `POST /api/auth/login` is live and matches the Frontend Wiring Prompt's
   documented response shape (camelCase — already confirmed).
2. Build Frontend Session 1: real app shell, not the demo shell.
3. Do NOT build role-based nav from assumed permissions — read the actual
   `canApprovePhotos` / `canViewInvoices` / `canEditPatientInfo` flags off the real
   login response.

**Backend Session 2 lands (case CRUD, state machine) →**
1. Hit `GET /api/cases` and `GET /api/cases/:id` once for real, confirm JSON casing
   (the wiring prompt flags this as unconfirmed — camelCase vs snake_case). Don't
   build the table against a guess.
2. Build Frontend Session 2 against the confirmed shape.
3. Check `src/routes/*.routes.js` for a practices/dentists/case-types endpoint
   before building the New Case form's dropdowns — don't assume one exists.

**Backend Session 3 lands (approvals table, notification triggers) →**
1. Confirm the `approvals` endpoints and payload shape (approval_id, case_id,
   media_id, stage, status, approved_by, comments, responded_at) against the real
   controller, not the spec doc.
2. Build the Approve / Request Changes UI. Gate the action buttons behind
   `canApprovePhotos` — but remember gating is cosmetic; the 403 is the real
   enforcement.
3. Un-hide the "Action required queue" panel that was left hardcoded/hidden in
   Session 0 — this is what unblocks it.

**Backend Session 4 lands (billing, QC) →**
1. Confirm invoice endpoints are manual-mark-paid only (no Stripe fields yet) before
   wiring a payment button — don't build a "Pay Now" click handler this session,
   real Stripe is backend Session 8.
2. Build invoice list/detail + QC checklist screens.

**Backend Session 5 lands (messages, photos, shipments, warranty) →**
1. Confirm the `is_internal_note` flag's exact field name/casing before building
   the internal-vs-client message toggle.
2. Build messages, photo gallery, shipment tracking, warranty claim screens.

**Backend Session 6 lands (inventory, practice CRM) →**
1. Confirm lot/batch fields exist on stock transaction responses (compliance
   requirement, not optional) before building the materials table.
2. Build inventory + practice CRM screens.

**Backend Session 7 lands (reports, equipment) →**
1. Confirm `saved_reports` are served as read endpoints over existing data (they're
   views, not separate storage, per the Gap Audit) — don't build a report screen
   that expects its own writable dataset.
2. Build report/dashboard views + equipment/scheduling screens.

**Backend Session 8 lands (Stripe, both directions) →**
1. This is scope beyond the original $8K baseline on both sides — confirm pricing/
   timeline was actually resolved with the client before building, same flag as
   backend.
2. Build Stripe Checkout UI for dental office → lab, then lab → manufacturer.

**Backend Session 9 lands (integration + hardening) →**
1. Do the frontend's own integration pass in parallel: every screen built in
   Frontend Sessions 1-8 against the final, stable API.
2. Resolve the sessionStorage-vs-httpOnly-cookie flag from the Wiring Prompt now,
   not before — this was deliberately deferred to a later, more production-minded
   session.
3. Full responsive + accessibility pass, permission-gating audit (confirm blocked
   actions are hidden, not just disabled, for portal users).

---

## 3. Standing Frontend Conventions (don't drift from these)

- **Stack:** React + TypeScript + Tailwind, per the original build prompt — the
  demo `index.html` (vanilla HTML/CSS/JS + Chart.js) is a prototype and pitch
  artifact, not the production frontend.
- **Verify casing before coding.** The backend serializes some responses camelCase
  (auth) and possibly snake_case elsewhere (unconfirmed per the wiring prompt) —
  hit the real endpoint once per new resource type before writing render code.
  Don't ship `??` dual-fallback code as a permanent fix; confirm and simplify.
- **Don't build against guessed endpoints.** Check `src/routes/*.routes.js` (or the
  equivalent for whatever session just landed) before writing a fetch call for
  anything not already documented in a wiring prompt.
- **Role gating is UI convenience, not security.** Every gate (hidden button,
  disabled action) mirrors a real server-side check that already exists — the
  frontend never becomes the only enforcement layer.
- **Don't wire ahead of the backend.** Nav items / panels for modules whose backend
  session hasn't landed stay stubbed "Coming soon" or hidden — same rule the
  wiring prompt already applied to Practices/Technicians/Materials/Equipment/
  Invoices/Reports in Session 0.
- **A file existing is not the same as a feature being live.** Session 2 was
  committed with `CaseQueuePage.tsx`/`CaseDetailPage.tsx` fully written, but
  `App.tsx` was never updated to route to them, `navConfig.ts` never flipped
  their stub flag, and `lib/api.ts` never got the functions those pages called
  — so the screen sat as dead code behind a permanent "Coming soon" stub, and
  nobody could tell from the repo alone. Before calling any session done: grep
  for every new component being imported somewhere outside its own file, and
  click into the actual running nav item — don't just confirm the source file
  is present.
- **`FRONTEND_LOG.md` is not optional, and "update it" means every session,
  not just the ones that felt big.** Session 2 shipped without a log entry;
  that silence is exactly what let the gap above go undetected across
  multiple later sessions. A session isn't finished until the log reflects
  it — no exceptions for small or "obvious" sessions.
- **Every session ends by:** updating `FRONTEND_LOG.md` (mirrors `BUILD_LOG.md` —
  what's built, which endpoint shapes were confirmed, any decisions made on
  ambiguity), commit with a descriptive message, push.

---

## 4. How to Pick Up Any Frontend Session

1. Read `FRONTEND_LOG.md`'s most recent entry (create it at Session 0/1 if it
   doesn't exist yet — the Wiring Prompt already flagged this gap).
2. Confirm the backend session this frontend session depends on is actually live —
   run `npm test` in the backend repo per its own pickup checklist, or hit the
   relevant endpoint directly.
3. Confirm response shapes for anything new against the real running backend, not
   the spec docs — the spec docs describe intent, the running code is truth.
4. Build, referencing the Standing Conventions above.
5. Update `FRONTEND_LOG.md`, commit, push.

---

## 5. Known Open Items (carried forward from other docs, relevant to frontend)

- **Token storage:** Wiring Prompt uses `sessionStorage` for the demo, flagged as a
  decision needing confirmation before production — resolve explicitly at Frontend
  Session 9, not silently carried forward forever.
- **"Skip to dashboard preview" link:** exists in the demo, bypasses auth entirely —
  gate behind `?demo=1` or remove once Frontend Session 1's real auth is live.
  Don't ship it live by accident.
- **Free-text case search:** no backend param exists for it (confirmed in the
  Wiring Prompt) — stays client-side filtering indefinitely unless a future backend
  session adds one. Don't invent a backend param unilaterally.
- **Visual identity unconfirmed:** the demo's porcelain white / clinical teal / warm
  coral palette was designed fresh, not cross-checked against the client's actual
  "Eminent OS" branded mockup images (§11.1 of the Master Blueprint) — verify
  before this becomes the final production palette.
