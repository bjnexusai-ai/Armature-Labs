# BUILD LOG — Armature Labs Backend

Read this first at the start of every session. It's the single source of truth
for what's done, what's next, and any decisions made along the way. Update it
before ending every session, right before the final commit.

---

## Session 1 — COMPLETE (Phase 1: schema, auth, RBAC, tenant isolation)

**Stack confirmed:** Node.js/Express + PostgreSQL 16 + `node-pg-migrate` for migrations
(raw SQL-generating, no ORM). Production target: AWS/DigitalOcean + RDS, same pattern
as Trestle. Local dev: Postgres running directly in the build container.

**What's built and verified working (18/18 automated tests passing, `npm test`):**

- All 13 Phase 1 tables + `system_settings` (client's own §8 spec) as reversible
  migrations — `migrations/0001` through `0013`. Up AND down tested (full rollback
  verified clean, not just assumed).
- `cases.current_status` uses the 10-status enum (`Case Entered` → ... → `Delivered`,
  plus `Case on Hold`/`Delayed`) as the authoritative state machine — gap #12 resolved.
  `workflow_stages` seeded separately with the 7-step internal tracker (Submitted/
  Intake/Design/Review/Production/QC/Shipping) as sub-stage detail, not a competing model.
- `case_number` auto-generates as `CASE-YYYY-NNNNN` via a DB trigger + sequence.
- `users` table carries `can_approve_photos`/`can_view_invoices`/`can_edit_patient_info`
  directly (client's own §8 field spec, not a separate permissions table).
- Auth: bcrypt password hashing, JWT access (15m) + refresh (7d) tokens. Role/permissions
  are loaded FRESH from the DB on every request, never trusted from the JWT payload —
  a permission change takes effect on the user's next request, not after token expiry.
- RBAC middleware: `requireRole`, `requireInternal`, `requireBillingAccess` (Owner/Office
  Manager only, per §4.7), `requirePortalPermission` (gates the three dentist_client flags).
- Server-side tenant isolation (`middleware/tenantIsolation.js`) — a dentist_client can
  only ever see their own practice's data, enforced in the query layer, not the UI.
  Explicitly tested: cross-tenant GET by ID returns 403, not a leaked 404-vs-200 tell.
- Centralized error handling — Postgres error codes (unique/FK/enum violations) map to
  clean 400/409 responses instead of leaking stack traces or raw DB errors.
- Seed script: 5 pre-created accounts (Owner, Office Manager, 2x Assistant/Technician,
  Designer) + 1 example practice + 1 dentist portal user + 1 example case. All seeded
  passwords: `TestPass123!`. Idempotent — safe to re-run, skips existing records.

**Bug found and fixed during this session:** `node-pg-migrate`'s `'bigserial'` string
shorthand does NOT create a primary key on its own (unlike the `'id'` shorthand, which
does). Nine tables were affected; all fixed to `{ type: 'bigserial', primaryKey: true }`
before the schema was verified. Caught by actually running the migration against Postgres,
not by inspection — this is why every session tests against a real DB, not just lint/review.

**Explicit decisions carried into this build (see Gap Audit / Master Blueprint for full
reasoning):**
- 10-status lifecycle is the state machine; 7-step tracker is `workflow_stages` seed data.
- `system_settings`, user permission booleans, and the future `approvals` table are built
  exactly to the client's own §8 field spec, not improvised from the 39-table PDF schema.
- Case number format `CASE-YYYY-NNNNN` — our invention, client never specified exact format.

## Session 2 — COMPLETE (Case CRUD + 10-status state machine)

**What's built and verified working (40/40 automated tests passing, `npm test` —
18 from Session 1 + 22 new):**

- `src/utils/caseStatus.js`: pure state-machine logic, no DB access — strict forward
  adjacency through the 8-state linear flow, Hold/Delayed as exception states enterable
  from any active linear status (not Delivered), Delivered as a true terminal state, and
  the default `current_status` -> `workflow_stages.name` mapping.
- `POST /api/cases` — internal staff only (`requireInternal`). Validates practice_id,
  dentist_id (must be a real `dentist_client` user), case_type_id all exist, AND that
  dentist_id's `practice_users` row actually matches practice_id. `case_number` and
  `current_status` are DB-owned (trigger / column default) — the create schema is
  `.strict()`, so any attempt to pass `caseNumber` (or any other unrecognized key)
  throws a clean 400 automatically.
- `GET /api/cases` — filterable (`status`, `practice_id`, `assigned_staff_id`,
  `priority`), paginated (default limit 25, max 100), server-side tenant isolation via
  the existing `practiceScopeClause` helper (reused, not reimplemented).
- `GET /api/cases/:id` — includes the current `case_stage_history` entry and last 10
  `case_status_audit` rows inline. Tenant isolation checked AFTER the existence lookup,
  so a cross-tenant hit is 403 (case exists, you can't see it), not a 404 that would
  leak nonexistence-vs-hidden as a timing/response tell — matches the existing
  `practices.controller.js` pattern.
- `PATCH /api/cases/:id` — non-status fields only. `.strict()` schema means any attempt
  to set `currentStatus` (or any unrecognized key) is rejected with 400 automatically,
  same mechanism as above — status changes can only ever go through the endpoint below,
  so audit logging can't be bypassed.
- `PATCH /api/cases/:id/status` — internal staff only, transaction-wrapped: (1) updates
  `cases.current_status`/`prior_status`, (2) inserts `case_status_audit` unconditionally,
  (3) updates/inserts `case_stage_history` per the mapping rules below. Invalid/skipped
  transitions return 409 with a specific message (not a generic 400). Row-locked
  (`SELECT ... FOR UPDATE`) inside the transaction to prevent a race between two
  concurrent transition requests on the same case.

**Explicit decisions made on ambiguous points (prompt asked these be recorded here,
not silently picked):**

1. **Intake has no `current_status` equivalent.** `Case Entered` defaults to the
   `Submitted` workflow_stage (not `Intake`) — `Submitted` is the case's actual entry
   point into the 7-step tracker. `Intake` stays reachable only via an explicit
   `stage_id` override on the status endpoint, never as a default.
2. **`case_stage_history` behavior for the two exception states differs, because the
   `stage_history_status` enum only has a `Delayed` value, not a `Hold` value:**
   - Entering `Case on Hold`: `case_stage_history` is left untouched — Hold reads as
     an administrative pause, not a stage-level event, and there's no enum value for it.
   - Entering `Delayed`: the case's current open stage row (`In Progress`) is updated
     in place to `Delayed` — no new row, no `completed_at`, since the stage itself
     hasn't changed, it's just paused.
   - Clearing Hold: no-op on `case_stage_history` (nothing was touched entering it).
   - Clearing Delayed: reverts that same row from `Delayed` back to `In Progress`.
3. **Remarks requirement on clear, not just entry.** The build prompt's Rules section
   only says remarks are required "entering" Hold/Delayed; the Endpoints section says
   "required if entering/clearing". Went with the stricter Endpoints-section reading —
   remarks are required on both entry AND clear, since an audit trail benefits from
   knowing why a hold/delay was lifted too, not just why it started.
4. **Initial `case_stage_history` row seeded at case creation.** Not explicitly asked
   for by the prompt, but `GET /:id` promises "the current case_stage_history entry" —
   without seeding a `Submitted`/`In Progress` row at create time there'd be nothing to
   return for a brand-new case. Done inside the same creation transaction. (The
   Session 1 seed script's example case predates this and has no stage-history row —
   `currentStage` correctly comes back `null` for it, handled gracefully, not a bug.)
5. **Initial `case_status_audit` row also written at creation** (`old_status: NULL`,
   `new_status: 'Case Entered'`), mirroring the exact pattern the Session 1 seed script
   already used for its example case — keeps every case's audit trail starting at its
   true beginning rather than at its first transition.
6. **Same-stage forward transitions don't double-insert.** `Shipped Out` and
   `Delivered` both map to the `Shipping` stage. Rather than inserting a second
   `Shipping` row on delivery, the transition logic detects "new stage === current open
   row's stage" and completes that one row in place (`completed_at` set) — satisfies
   "Delivered -> Shipping (final, completed_at set)" without a spurious duplicate row.

**Bug found (pre-existing, Session 1, NOT fixed — out of Session 2's scope, noted for
whoever picks this up):** `users.controller.js`'s `createUserSchema` uses plain
`z.number()` for `practiceId` rather than `z.coerce.number()`. Since `practices.id` is
`bigserial` and Postgres/pg serializes `bigint` columns as JSON strings (not numbers,
to avoid precision loss), any real caller round-tripping a practice ID they just
received from `POST /api/practices` or `GET /api/practices` back into
`POST /api/users` will get a spurious 400 ("expected number, received string") unless
they manually cast it. `cases.controller.js` in this session uses `z.coerce.number()`
for all ID fields specifically to avoid this. Recommend Session 3 (or a quick fix
whenever `users.controller.js` is next touched) apply the same coercion there.

**Not yet built (future sessions, per the 9-session plan):**
- Session 3: `approvals` table (client's exact §8 spec — design/bisque gates), notification
  triggers (can stub the actual email/SMS/push send, but the trigger logic must be real).
  Approve/Request Changes will call `updateCaseStatus`'s transition logic internally on
  the office's behalf — the portal itself stays read-only on status, per Session 2's
  `requireInternal` guard on `PATCH /:id/status`, which is not relaxed by Session 3.
- Session 4: Phase 2 billing (fee_schedules, invoices, payments) + QC checklists/rework.
- Session 5: messaging/notes, progress_photos, shipments, warranty_claims.
- Session 6: Phase 3 inventory (materials, vendors, purchase_orders, stock_transactions
  with lot tracking) + practice_contracts/notes.
- Session 7: saved_reports (as views over existing data, not new storage), equipment,
  technician_shifts, equipment_bookings.
- Session 8: Stripe both directions (dental office→lab, lab→manufacturer) — flagged in
  the gap audit as scope beyond the original $8K baseline, build after everything else.
- Session 9: full integration pass across every endpoint, security hardening review.

**How to pick this up in a fresh session:**
1. `git clone` this repo, `npm install` (repo root — no `backend` subfolder exists)
2. Local Postgres: `createdb dentallab_dev`, copy `.env.example` to `.env`
3. `npm run migrate:up` then `npm run seed`
4. `npm test` — should show 40/40 passing before you write a single new line
5. Read this file's "Not yet built" section, pick up at Session 3
6. Commit + push before ending the session, no exceptions — update this log first

---

## Session 3 — COMPLETE (approvals table + Approve/Request Changes + notification triggers)

**What's built and verified working (54/54 automated tests passing, `npm test` —
40 from Sessions 1-2 + 14 new):**

- `migrations/0014_approvals.js` — the client's exact §8 field spec. Up AND
  down tested (dropped and re-applied clean, not just assumed).
- `src/services/caseStatusTransition.js` — Session 2's `updateCaseStatus`
  transaction body extracted verbatim into `applyCaseStatusTransition(client,
  {...})`. `cases.controller.js`'s `updateCaseStatus` is now a thin wrapper.
  Ran `cases.integration.test.js` immediately after the extraction, before
  writing any approvals code — all 22 of its tests passed unchanged, confirming
  no behavior change.
- `src/utils/caseStatus.js` — new `'approval_reverted'` transition kind, added
  as a second parameter to `evaluateTransition(input, { allowApprovalRevert })`.
  Legal ONLY `Pending Design Approval -> In Design` and `Pending Bisque
  Approval -> Processing`, and ONLY when the caller explicitly passes
  `allowApprovalRevert: true`. `updateCaseStatus`'s thin wrapper never passes
  this flag, so `PATCH /api/cases/:id/status` can never reach it directly —
  verified by an explicit test (upload design media twice with a request-changes
  round trip in between, then attempt the same backward move via the raw
  status endpoint: 409).
- `POST /api/cases/:id/media` (new — no prior upload endpoint existed to
  extend, confirmed by checking `cases.controller.js` and grepping for
  `case_files` first). Internal staff only. Accepts `mediaStage: 'design' |
  'bisque'` only this session (other `case_files.media_stage` values aren't
  wired to the approval-trigger behavior and are out of scope here). On
  success, in one transaction: inserts `case_files`, inserts a pending
  `approvals` row, calls `applyCaseStatusTransition` to move the case into
  `Pending Design Approval` / `Pending Bisque Approval` (a normal forward
  transition — if the case isn't at the right predecessor status this
  correctly 409s), then fires the `approval_requested` notification to every
  portal user on that practice with `can_approve_photos = true`.
- `POST /api/approvals/:id/approve` and `POST /api/approvals/:id/request-changes`
  — both share `loadAndAuthorizeApproval` (row-locks the `approvals` row,
  checks `can_approve_photos`, tenant access via `assertPracticeAccess`, and
  pending status) in `approvals.controller.js`. Approve advances the case
  forward (`Processing` / `Finalizing`); request-changes requires `comments`
  and reverts the case (`In Design` / `Processing`) via the new
  `allowApprovalRevert: true` path. Each fires its own notification
  (`approval_given` / `changes_requested`) to the case's `assigned_staff_id`.
- `src/services/notifications.js` — `notify({ event, recipientUserIds,
  payload })`, logic real, send stubbed (console.log only, no
  `notification_log` table — kept minimal since tests assert via
  `jest.spyOn`, not by querying a log table; revisit if a later session needs
  a queryable notification history).

**Decision recorded per §2a's explicit instruction:** `approvals.media_id`
references `case_files`, not `progress_photos` — `progress_photos` doesn't
exist until Session 5, and `case_files.media_stage` already covers
`design`/`bisque` today. If Session 5's `progress_photos` turns out to be the
intended long-term target for approval-stage media, that's a Session 5
migration decision (e.g. a nullable `progress_photo_id` alongside, or a data
migration) — not decided here.

**Additional decision (not explicitly specified, made and documented per the
same instruction):** `POST /api/cases/:id/media` is metadata-only — it
assumes the binary file is already placed in object storage by the caller
(e.g. a pre-signed frontend upload) and just records the pointer (`fileUrl`)
plus enough metadata to satisfy the approvals gate. No multer/S3 wiring was
built this session; that infrastructure isn't part of Session 3's scope per
the build prompt's own stack section, which lists S3 but doesn't mandate
wiring it here. Flagged for whoever eventually builds real object-storage
upload handling.

**Bug found (pre-existing, Session 1/2, NOT fixed — still out of scope,
carried forward from Session 2's note):** `users.controller.js`'s
`createUserSchema` still uses plain `z.number()` for `practiceId` instead of
`z.coerce.number()`. Not touched this session since Session 3 had no reason
to modify `users.controller.js` beyond calling it from tests (where the
existing test convention of wrapping IDs in `Number(...)` before sending
already works around it, same as Session 2's own tests do).

**Not yet built (future sessions, per the 9-session plan):**
- Session 4: Phase 2 billing (fee_schedules, invoices, payments) + QC checklists/rework.
- Session 5: messaging/notes, `progress_photos`, shipments, warranty_claims —
  and the `approvals.media_id` question above should be revisited here.
- Session 6: Phase 3 inventory (materials, vendors, purchase_orders, stock_transactions
  with lot tracking) + practice_contracts/notes.
- Session 7: saved_reports (as views over existing data, not new storage), equipment,
  technician_shifts, equipment_bookings.
- Session 8: Stripe both directions (dental office→lab, lab→manufacturer) — flagged in
  the gap audit as scope beyond the original $8K baseline, build after everything else.
- Session 9: full integration pass across every endpoint, security hardening review.

**How to pick this up in a fresh session:**
1. `git clone` this repo, `npm install` (repo root — no `backend` subfolder exists)
2. Local Postgres: `createdb dentallab_dev`, copy `.env.example` to `.env`
3. `npm run migrate:up` then `npm run seed`
4. `npm test` — should show 54/54 passing before you write a single new line
5. Read this file's "Not yet built" section, pick up at Session 4
6. Commit + push before ending the session, no exceptions — update this log first

**Addendum (added while scoping Frontend Session 3 — verified against `git
log`/`git show`, not just this note):** the `0014_approvals` migration's own
comment said the table would be "queried both ways: pending approvals for a
case, and all pending approvals across the practice, for a portal
dashboard" — but only `POST /:id/approve` and `POST /:id/request-changes`
were ever built. There was no `GET /api/approvals` anywhere, confirmed by
reading `approvals.routes.js`, `cases.routes.js`, and `app.js`'s full route
mount list directly. This blocked Frontend Session 3's approvals queue and
notification bell, which have nothing to read from without it.

Closed via `listApprovals` in `approvals.controller.js`, mounted as
`GET /api/approvals` in `approvals.routes.js`. Supports `caseId`,
`practiceId` (internal staff only, mirrors `listCases`' own restriction),
`status`, `stage`, `page`, `limit`. Tenant-scoped via the existing
`practiceScopeClause` helper joined through `cases.practice_id` — **not**
gated on `can_approve_photos`, since that flag governs the two write
actions per the client's §8 spec, not read visibility (same visibility
rule as `GET /api/cases`). Joined against `cases` (case_number,
patient_name, current_status) and `case_files` (file_name, file_url) in
one query so the frontend doesn't need a second round-trip per row.

5 new integration tests added (happy path + join shape, status filtering,
cross-tenant isolation for a dentist_client without `can_approve_photos`,
400 on an explicit `practiceId` from a portal user, 401 unauthenticated).
Verified on a fully clean `DROP DATABASE` + migrate + seed, not a dirtied
suite-run DB: **149/149 passing, 13/13 suites** (144 baseline + 5 new).
Also hit live via `curl` after starting the server locally to confirm the
actual JSON shape (snake_case field names, consistent with the rest of the
cases/approvals API — not camelCase, unlike auth).

---



## Session 3.5 — COMPLETE (repo reorg: backend/ subfolder)

**What changed:** All backend code moved from repo root into a new backend/
subfolder, ahead of frontend work starting in a future session, to avoid any
path collisions once a frontend/ folder is added alongside it.

- Moved via git mv (history preserved, shows as renames not delete+add):
  migrations/, seed/, src/, tests/, jest.config.js, .env.example,
  .node-pg-migraterc.json, package.json, package-lock.json.
- node_modules was NOT moved (gitignored) - reinstalled fresh inside
  backend/ via npm install.
- Local .env (gitignored, not tracked) manually relocated from repo root
  into backend/.env - required for DATABASE_URL / JWT_ACCESS_SECRET /
  JWT_REFRESH_SECRET to load correctly, since dotenv resolves relative to
  cwd and scripts now run from inside backend/.
- Verified clean after the move: npm run migrate:up and npm test both
  run successfully from backend/, all 54/54 tests still passing - confirms
  no path-relative code broke as a result of the reorg.
- Also fixed in this session: removed a dead setupFilesAfterEach: undefined
  key from jest.config.js (not a real Jest option, was silently doing
  nothing; the correct key, setupFilesAfterEnv, was already present and
  correctly wired to tests/setup.js).
- BUILD_LOG.md and README.md remain at repo root (project-level docs);
  everything backend-specific now lives under backend/.

Root structure is now:

Armature-Labs/
  BUILD_LOG.md
  README.md
  .gitignore
  backend/
    migrations/
    seed/
    src/
    tests/
    jest.config.js
    .env.example
    .node-pg-migraterc.json
    package.json
    package-lock.json

How to pick this up in a fresh session (UPDATED - note the cd backend
step, this differs from Sessions 1-3's instructions above):
1. git clone this repo
2. cd backend - package.json and all backend code now live here, NOT repo root
3. npm install
4. Local Postgres: createdb dentallab_dev, copy .env.example to .env
   (inside backend/)
5. npm run migrate:up then npm run seed
6. npm test - should show 54/54 passing before you write a single new line
7. Read this file's "Not yet built" section (see Session 3 above), pick up
   at Session 4
8. Commit + push before ending the session, no exceptions - update this log
   first

## Session 3.5 — COMPLETE (repo reorg: backend/ subfolder)

**What changed:** All backend code moved from repo root into a new backend/
subfolder, ahead of frontend work starting in a future session, to avoid any
path collisions once a frontend/ folder is added alongside it.

- Moved via git mv (history preserved, shows as renames not delete+add):
  migrations/, seed/, src/, tests/, jest.config.js, .env.example,
  .node-pg-migraterc.json, package.json, package-lock.json.
- node_modules was NOT moved (gitignored) - reinstalled fresh inside
  backend/ via npm install.
- Local .env (gitignored, not tracked) manually relocated from repo root
  into backend/.env - required for DATABASE_URL / JWT_ACCESS_SECRET /
  JWT_REFRESH_SECRET to load correctly, since dotenv resolves relative to
  cwd and scripts now run from inside backend/.
- Verified clean after the move: npm run migrate:up and npm test both
  run successfully from backend/, all 54/54 tests still passing - confirms
  no path-relative code broke as a result of the reorg.
- Also fixed in this session: removed a dead setupFilesAfterEach: undefined
  key from jest.config.js (not a real Jest option, was silently doing
  nothing; the correct key, setupFilesAfterEnv, was already present and
  correctly wired to tests/setup.js).
- BUILD_LOG.md and README.md remain at repo root (project-level docs);
  everything backend-specific now lives under backend/.

Root structure is now:

Armature-Labs/
  BUILD_LOG.md
  README.md
  .gitignore
  backend/
    migrations/
    seed/
    src/
    tests/
    jest.config.js
    .env.example
    .node-pg-migraterc.json
    package.json
    package-lock.json

How to pick this up in a fresh session (UPDATED - note the cd backend
step, this differs from Sessions 1-3's instructions above):
1. git clone this repo
2. cd backend - package.json and all backend code now live here, NOT repo root
3. npm install
4. Local Postgres: createdb dentallab_dev, copy .env.example to .env
   (inside backend/)
5. npm run migrate:up then npm run seed
6. npm test - should show 54/54 passing before you write a single new line
7. Read this file's "Not yet built" section (see Session 3 above), pick up
   at Session 4
8. Commit + push before ending the session, no exceptions - update this log
   first

## Session 4 — Billing + QC/Rework/Final Approval

**What was built:**

- 4 new migrations (all tested up AND down before use — rolled back one at a
  time, reapplied clean, then confirmed 54/54 still passing on top of the
  new schema before writing any application code):
  - `0015_fee_schedules.js` — fee_schedules, fee_schedule_items,
    practice_fee_schedules (one active schedule per practice)
  - `0016_invoices_and_payments.js` — invoices, invoice_line_items, payments.
    invoice_number auto-generates as INV-YYYY-NNNN via trigger, same pattern
    as cases.case_number.
  - `0017_qc_checklists.js` — qc_checklists (optionally case_type-scoped
    templates), qc_checklist_items, case_qc_results (per-item results stored
    as JSONB on one atomic run record — no cross-run item-level reporting
    requirement yet that would justify a child table)
  - `0018_case_rework_and_final_approvals.js` — case_rework,
    case_final_approvals (unique per case_id — one final approval per case)
- `billing.controller.js` — fee schedules; invoices (server-computed
  subtotal, transaction-safe creation); payments (row-locked read via
  `FOR UPDATE` so concurrent payments can't race on amount_paid,
  partial-payment-safe, auto-marks Paid once amount_paid meets subtotal,
  blocks payments against a Void invoice)
- `qc.controller.js` — checklist templates; QC results (overall_status
  derived server-side from itemResults, not trusted from the client); rework
  open/resolve; final approval (requires a QC result with
  overall_status='Pass', enforced at both the app layer and via DB unique
  constraint for the one-per-case rule)
- Routes: `billing.routes.js`, `qc.routes.js`, plus case-scoped QC
  results/rework/final-approval extensions to `cases.routes.js` and a
  `PUT /:id/fee-schedule` extension to `practices.routes.js`. Both new
  routers mounted in `app.js` at `/api/billing` and `/api/qc`.
- 15 new integration tests across `tests/billing.integration.test.js` and
  `tests/qc.integration.test.js`. Full suite: **69/69 passing** (54 prior +
  15 new).

**Decision (documented per this project's standing convention — record
ambiguous points here rather than silently picking one):** `case_rework`
does NOT drive `cases.current_status` through the existing state-transition
service (`services/caseStatusTransition.js` / `utils/caseStatus.js`). That
machine only permits forward moves plus two named exceptions (Hold/Delayed)
and a narrow approval-revert map — a generic "send back for rework" isn't a
legal transition there, and extending that shared, already-tested Session
2/3 logic was out of this session's scope. Rework is tracked as its own
independent audit trail (`case_rework` table, resolved_at/resolved_by) and
never writes to `cases.current_status`. Verified by test: opening a rework
record leaves `cases.current_status` unchanged.

**Fee-schedule read-access composition:** `requireBillingAccess` (internal
Owner/Office Manager only) and `requirePortalPermission('can_view_invoices')`
(portal) don't compose directly for the "internal must be billing-role OR
portal must have the flag" rule invoice reads need, so
`billing.routes.js` adds a small `requireInvoiceReadAccess` wrapper that
branches on `req.user.role` and delegates to the correct existing middleware
rather than bending either one out of shape.

**Not yet built (deferred to later sessions per the confirmed scope):**

- Real Stripe/ACH payment processing (Session 8) — this session's payments
  are manual mark-paid only, `method` is free text, no processor integration
- Frontend for billing/QC (backend-only session)

**Correction (added during Session 5.5 close-out, verified against `git log`):**
this note was stale. Session 4's changes ARE committed and pushed —
commit `3668d7a` ("Session 4: billing (fee schedules, invoices,
payments) + QC/rework/final approval"). A fresh clone of
`bjnexusai-ai/Armature-Labs` already has this session's files; `npm test`
shows 69/69 (part of the current 118/118 full suite) with no manual
file application needed. See `PARALLEL_BUILD_PROTOCOL.md` §1 for the
original correction.

How to pick this up in a fresh session:
1. Apply this session's files (fee_schedules/invoices/qc/rework migrations,
   billing.controller.js, qc.controller.js, billing.routes.js, qc.routes.js,
   the cases.routes.js/practices.routes.js/app.js edits, and the two new
   test files) on top of the Session 3.5 commit, OR start from the zip
2. cd backend, npm install
3. Local Postgres: createdb dentallab_dev, copy .env.example to .env
4. npm run migrate:up then npm run seed
5. npm test — should show 69/69 passing
6. Next up: real Stripe/ACH (Session 8 scope) or frontend work
7. Commit + push before ending the session if git access is available

## Session 5 — Messaging/Notes, Progress Photos, Shipments, Warranty Claims

**Baseline confirmed before writing anything:** cloned the repo, `npm install`,
`npm run migrate:up` + `npm run seed`, `npm test` — **69/69 passing** on
Session 4's code, exactly as this session's build prompt required.

**What was built:**

- 4 new migrations (all tested up AND down — rolled back one at a time,
  reapplied clean, 69/69 re-confirmed passing on top of the new schema
  before any controller code was written):
  - `0019_case_notes.js` — `case_notes`, with a `note_visibility` enum
    (`internal`/`portal`) rather than a boolean, matching how `media_stage`
    and other client-facing enums already read in this schema.
  - `0020_progress_photos.js` — `progress_photos`, a separate table from
    `case_files`/`approvals`, no FK between them.
  - `0021_shipments.js` — `shipments`, one-to-many per case (a case can
    have more than one shipment, e.g. a reshipment after a warranty claim).
  - `0022_warranty_claims.js` — `warranty_claims`.
- `notes.controller.js` / case-scoped `notes` endpoints — two-way messaging.
- `progressPhotos.controller.js` / case-scoped `progress-photos` endpoints —
  lab-staff only.
- `fulfillment.controller.js` — shipments (case-scoped create/list +
  non-case-scoped `PATCH /api/fulfillment/shipments/:id/status`) and
  warranty claims (case-scoped create/list + non-case-scoped
  `PATCH /api/fulfillment/warranty-claims/:id/resolve`).
- Routes: case-scoped endpoints (`notes`, `progress-photos`, `shipments`,
  `warranty-claims`) extend `cases.routes.js`, same pattern as Session 4's
  QC/rework/final-approval. A new `fulfillment.routes.js` holds the two
  not-case-scoped staff actions, mounted in `app.js` at `/api/fulfillment`.
- 31 new integration tests across `tests/notes.integration.test.js`,
  `tests/progressPhotos.integration.test.js`,
  `tests/shipments.integration.test.js`, and
  `tests/warrantyClaims.integration.test.js`. Full suite: **100/100
  passing** (69 prior + 31 new).

**Decision — `approvals.media_id` / `progress_photos` (the open question
flagged at the end of Session 3):** NOT repointed. `approvals.media_id`
keeps referencing `case_files`, unchanged. `case_files.media_stage` already
covers the `design`/`bisque` approval-gate categories end-to-end (tested in
Sessions 2–3), and repointing a working FK for no functional gain would
risk an unnecessary data migration and touch `approvals.controller.js`
outside this session's scope. `progress_photos` is a separate, simpler
table for ad-hoc production shots that were never part of the approval
gate — no FK relationship between the two tables. See the migration file's
own comment for the full reasoning.

**Decision — messaging is two-way, not staff-only:** Master Blueprint §4.10
and the §5 notification table both show "Client Notes (visible to
office)" and *two* triggers — "New Client Note (from office) -> Assigned
Staff" and "New Client Note (from lab) -> Dental Office" — so both internal
staff and a `dentist_client` with tenant access to the case can create a
note, not staff alone. A `dentist_client`'s note is always forced to
`visibility='portal'` server-side (there's no such thing as a
client-authored internal note); a staff note defaults to `internal` per the
migration's own documented default, and only becomes portal-visible by
explicit choice. `GET` filters a `dentist_client` down to `visibility='portal'`
rows only, regardless of tenant access to the case.

**Decision — `progress_photos` access is lab-staff only, not portal-visible:**
unlike notes, there's no notification-table entry or blueprint line putting
progress shots in front of the dental office, and the client's three
existing portal permission flags don't cover this. Treated as an internal
production-tracking aid pending an explicit client answer — flagged below
as something to revisit if the client says otherwise.

**Decision — shipment status updates don't drive `cases.current_status`:**
per this session's guardrail (`utils/caseStatus.js` /
`services/caseStatusTransition.js` out of scope), a shipment reaching
`Shipped`/`Delivered` does NOT push the case's own status forward — staff
still do that separately via the existing `PATCH /api/cases/:id/status`.
What the shipment-status endpoint DOES do is fire the notification-table
entries ("Case Shipped Out" / "Case Delivered" -> Dental Office) directly,
since that's a more accurate trigger point for a shipment-specific
notification than the case-status endpoint would be.

**Decision — warranty claim notifications (not in the original spec's
notification table — a Session 5 addition):** claim filed -> notify the
case's `assigned_staff_id` (skipped if unassigned); claim resolved
(`Approved`/`Denied`/`Resolved`) -> notify the filer. `Under Review` is not
treated as resolved — `resolved_at`/`resolved_by` stay null until the claim
reaches one of the three terminal-ish statuses, matching the migration's own
column comment ("Null while open/under review").

**Not yet built (deferred to later sessions per the confirmed 9-session
plan):**

- Frontend for notes/progress-photos/shipments/warranty-claims
  (backend-only session)
- Whether a dentist_client should be able to view `progress_photos` — no
  client answer yet, defaulted to lab-staff-only (see decision above)
- Session 6 (Phase 3 inventory): `materials`, `vendors`, `purchase_orders`,
  `stock_transactions` with lot tracking, plus `practice_contracts`/notes

**Correction (added during Session 5.5 close-out, verified against `git log`):**
this note was stale. Session 5's changes ARE committed and pushed —
commit `90f3f5c` ("Session 5: case notes, progress photos, shipments,
warranty claims"). A fresh clone of `bjnexusai-ai/Armature-Labs` already
has this session's files; `npm test` shows 100/100 (part of the current
118/118 full suite) with no manual file application needed. See
`PARALLEL_BUILD_PROTOCOL.md` §1 for the original correction.

How to pick this up in a fresh session:
1. Apply this session's files (the 4 new migrations, `notes.controller.js`,
   `progressPhotos.controller.js`, `fulfillment.controller.js`,
   `fulfillment.routes.js`, the `cases.routes.js`/`app.js` edits, and the
   4 new test files) on top of the Session 4 commit, OR start from the zip
2. cd backend, npm install
3. Local Postgres: createdb dentallab_dev, copy .env.example to .env
4. npm run migrate:up then npm run seed
5. npm test — should show 100/100 passing
6. Next up: Session 6 (Phase 3 inventory) per the scope above
7. Commit + push before ending the session if git access is available


## Session 5.5 — Patients entity + invoice client fields

**Why this session exists:** Client's Project Scope doc (§8) defines `PATIENT`
as its own entity, but Session 5 flattened patient data onto `cases` directly.
Session 4's `invoices` table also missed three fields the scope doc names on
`INVOICE`: `due_date`, `tax_amount`, `paid_date`. This session closes both gaps
at the schema level.

**What it adds:**
- `0023_patients.js` — new `patients` table (`practice_id` tenant FK
  referencing `practices` `ON DELETE RESTRICT`, `first_name`, `last_name`,
  `created_at`) + nullable `cases.patient_id` FK (`ON DELETE SET NULL`),
  both indexed.
- `0024_invoice_client_fields.js` — adds `due_date`, `tax_amount`, `paid_date`
  to `invoices`.

Both migrations are additive-only — no existing table or column was altered.
Verified: `npm run migrate:up` + `npm test` → 100/100 passing, same as
pre-5.5 baseline.

**What's still open (not built in this session):**
- No `patients.controller.js` or routes — the table exists but isn't exposed
  via the API yet.
- `cases.patient_id` is nullable and **not backfilled**. Existing cases still
  carry patient info only in `patient_name` (or equivalent legacy field);
  there is no migration/script yet to create `patients` rows from that data
  and populate `patient_id` on existing cases.
- No cutover plan yet for switching case creation/edit flows from the flat
  `patient_name` field to referencing `patients` records.

This session is schema groundwork only — the patient entity is not yet
usable end-to-end.

**Close-out (commit `0efddfa`, verified directly against `git log` + `git
show --stat`, not just the commit message):** all three items above are
now done. `patients.controller.js` + `patients.routes.js` built and
mounted at `/api/patients` in `app.js`. `0025_backfill_case_patient_id.js`
backfills `cases.patient_id` from the legacy flat field. Full suite:
118/118 passing, 10/10 suites. Session 5.5 is fully closed — no open
items remain.

---

## Session 6 — Phase 3 Inventory & Procurement + Practice CRM

**Scope (per Master Blueprint §11 Phase 3, confirmed against
PARALLEL_BUILD_PROTOCOL.md §8):** the 8-table subset — `material_categories`,
`materials`, `vendors`, `purchase_orders`, `purchase_order_items`,
`material_stock_transactions`, `practice_contracts`, `practice_notes`.
`saved_reports`, `equipment`/`equipment_maintenance_logs`, and
`technician_shifts`/`equipment_bookings` are the remaining Phase 3 tables and
are NOT part of this session — deferred to a later session.

**Migrations (`0026`–`0029`), each verified up AND down before building on
top of it, per this project's own convention:**
- `0026_material_categories_and_materials.js` — `materials.current_stock` is
  a maintained running balance (same pattern as `invoices.amount_paid`), not
  derived by summing transactions on read.
- `0027_vendors_and_purchase_orders.js` — `po_number` auto-generates as
  `PO-YYYY-NNNN` via trigger, same mechanism as `invoice_number`.
  `purchase_order_items.quantity_received` is likewise a maintained balance.
- `0028_material_stock_transactions.js` — `lot_number` is `NOT NULL` on
  every row, enforced at the schema level, per the Blueprint's explicit
  regulatory-traceability requirement ("which patient's case used which
  batch"). `quantity` is signed; sign convention is enforced by the
  controller, not the schema (see below).
- `0029_practice_contracts_and_notes.js` — both internal-only, no
  dentist_client access at all (unlike `case_notes`, no visibility split).

**Controllers/routes:**
- `inventory.controller.js` / `inventory.routes.js` — categories, materials,
  and the two operator-facing stock-transaction endpoints (`consume`,
  `adjust`). Exposes `recordStockTransaction()`, the shared, row-locked
  (`FOR UPDATE`) core that both this controller and procurement's receiving
  flow funnel through, so `materials.current_stock` can never drift from
  its transaction history no matter which endpoint wrote it.
- `procurement.controller.js` / `procurement.routes.js` — vendors, purchase
  orders, and receiving. PO status (`Partially Received` / `Received`) is
  always derived from actual `purchase_order_items.quantity_received`
  totals after each receive, never trusted from caller input.
- `accounts.controller.js`, wired into `practices.routes.js` (nested under
  `/api/practices/:id/contracts` and `/notes`, alongside the existing
  fee-schedule assignment route) — practice contracts (history, not a
  single mutable row — "current" = most recent by `created_at`) and
  practice notes.
- New `requireManagerRole` middleware (`auth.js`) — Owner/Office Manager
  gate for procurement writes and contracts/notes, kept separate from
  `requireBillingAccess` despite the identical role set, since it gates an
  unrelated resource.

**Role-gating decisions (no client answer on file for any of these — best
judgment, flagged for confirmation):**
- Inventory *reads* (categories, materials, transaction history): any
  internal staff. No dentist_client access anywhere in Phase 3 — enforced
  via `router.use(requireInternal)` at the top of both new route files.
- Logging Consumption: any internal staff (a technician's day-to-day job).
- Everything else Phase 3 — category/material creation, Adjustment,
  vendors, purchase orders (including receiving), practice
  contracts/notes: Owner/Office Manager only.

**Stock-transaction sign convention (controller-enforced, not
schema-enforced):** operator supplies a positive "how much"; the
controller decides the stored sign — Receiving/Adjustment(+) store
positive, Consumption/Return store negative. Adjustment is the one
exception where the caller supplies the signed value directly, since a
manual correction can legitimately go either direction.

**Verification:** confirmed baseline (118/118, 10/10 suites) on a fresh
clone before starting, per §5's rule. All 4 migrations tested up and down.
`node -e "require('./src/app')"` sanity-checked before writing tests.
Full suite after this session: **144/144 passing, 13/13 suites** (26 new
tests across `inventory`, `procurement`, `accounts`).

**Not yet built (deferred):**
- `saved_reports`, `equipment`/`equipment_maintenance_logs`,
  `technician_shifts`/`equipment_bookings` — remaining Phase 3 tables.
- Vendor/purchase-order update and delete endpoints — only
  create/list/get/status-transition/receive exist this session.
- No frontend for any of this (backend-only session, consistent with
  Sessions 4/5/5.5).
- Whether receiving should be openable to technicians (physical stock
  arrival) rather than Owner/Office Manager only — no client answer yet,
  defaulted to manager-only alongside the rest of procurement.
