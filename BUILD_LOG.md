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
