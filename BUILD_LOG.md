# BUILD LOG — Dental Lab CRM Backend

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

**Not yet built (future sessions, per the 9-session plan):**
- Session 2: Case CRUD, 10-status state machine transition logic + guards, wiring
  `case_stage_history` + `case_status_audit` on every transition.
- Session 3: `approvals` table (client's exact §8 spec — design/bisque gates), notification
  triggers (can stub the actual email/SMS/push send, but the trigger logic must be real).
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
1. `git clone` this repo, `cd backend && npm install`
2. Local Postgres: `createdb dentallab_dev`, copy `.env.example` to `.env`
3. `npm run migrate:up` then `npm run seed`
4. `npm test` — should show 18/18 passing before you write a single new line
5. Read this file's "Not yet built" section, pick up at the next unbuilt session
6. Commit + push before ending the session, no exceptions — update this log first
