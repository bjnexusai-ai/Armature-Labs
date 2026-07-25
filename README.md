# Armature Labs — Backend

Production backend for Armature Labs — Dental Lab Management & Case Tracking Platform.
Node.js/Express + PostgreSQL. See `BUILD_LOG.md` for what's built, what's next,
and session-by-session history — read that first.

## Requirements

- Node.js 20+
- PostgreSQL 16 (local, or point `DATABASE_URL` at RDS/managed Postgres)

## Setup

```bash
npm install
cp .env.example .env          # edit DATABASE_URL / JWT secrets for your environment
createdb dentallab_dev         # or point DATABASE_URL at an existing DB
npm run migrate:up             # applies all migrations
npm run seed                   # creates pre-seeded accounts + example data (idempotent)
npm run dev                    # starts on PORT from .env (default 4000)
```

## Pre-seeded accounts (all password: `TestPass123!`)

| Email | Role |
|---|---|
| owner@dentallab.test | owner |
| manager@dentallab.test | office_manager |
| tech1@dentallab.test | assistant_technician |
| tech2@dentallab.test | assistant_technician |
| designer@dentallab.test | designer |
| dentist@brightsmile.test | dentist_client (Bright Smile Dental Clinic) |

## Testing

```bash
npm test
```

Runs an integration suite against a real Postgres connection (`DATABASE_URL` from
`.env`) — not mocked. Requires migrations + seed to have been run first. Covers auth,
RBAC enforcement, server-side tenant isolation, validation, and error handling.

## Migrations

```bash
npm run migrate:up      # apply all pending migrations
npm run migrate:down    # roll back the most recent migration
npx node-pg-migrate create some_new_table   # scaffold a new migration file
```

Every migration has a tested `down()` — this schema has been fully rolled back and
reapplied at least once as part of verification, not just written and trusted.

## Project structure

```
migrations/       # node-pg-migrate files, one logical table (or tight group) each
src/
  config/db.js    # pg Pool + transaction helper
  middleware/     # auth, RBAC, tenant isolation, validation, error handling
  controllers/    # request handlers
  routes/         # route -> middleware -> controller wiring
  utils/          # password hashing, JWT signing/verification
  app.js          # express app assembly
  server.js       # entry point
seed/seed.js      # idempotent seed script
tests/            # jest + supertest integration tests
```

## Security notes

- Passwords: bcrypt, 12 salt rounds.
- JWT: short-lived access tokens (15m default), longer refresh tokens (7d default).
  Role and permission flags are re-read from the DB on every authenticated request —
  never trusted from the token payload.
- Tenant isolation (dentist_client users restricted to their own practice's data) is
  enforced server-side in the query layer, per `middleware/tenantIsolation.js` — not
  UI-only, per the client's explicit non-functional requirement.
- Billing/invoice routes (once built in session 4) will be restricted to Owner/Office
  Manager internally, consistent with the RBAC pattern already established here.
