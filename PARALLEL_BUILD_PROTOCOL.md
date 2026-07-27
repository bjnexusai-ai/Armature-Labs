# Armature Labs — Parallel Build Protocol

**Purpose:** one shared source of truth so backend and frontend sessions can
run in parallel without wasting time re-discovering what the other side has
actually finished, without building against guesses, and without repeating
the Frontend Session 2 mistake (files added, never wired, log never
updated — see `frontend/FRONTEND_LOG.md`'s Session 2 entry for the full
post-mortem).

This doc doesn't replace `BUILD_LOG.md` or `FRONTEND_LOG.md` — it's the
single-glance status board that sits above both. Update the table below
every time *either* log gets a new entry. If this table and a log
disagree, the log wins (it has the detail) — but update this table
immediately after, don't let it drift.

---

## 1. Correction to the record, made while assembling this doc

`BUILD_LOG.md`'s Session 4 and Session 5 entries both say **"Not
committed: delivered as a zip, not committed/pushed."** That's stale.
Confirmed directly against `git log`: both are actually committed and
pushed —

```
3668d7a Session 4: billing (fee schedules, invoices, payments) + QC/rework/final approval
90f3f5c Session 5: case notes, progress photos, shipments, warranty claims
```

Following this project's own standing rule (verify against running
code/git history, not the spec doc's prose), the table below reflects
git reality, not those two stale notes. Worth fixing in `BUILD_LOG.md`
itself next time someone's in there, same as the Frontend Session 2 log
correction — a log that says "not committed" when it actually is costs
someone real time re-verifying something that's already fine.

---

## 2. Status Board (update this every session, either side)

| # | Backend | Frontend | Frontend may start? |
|---|---|---|---|
| 1 | ✅ COMPLETE (18/18 tests) | ✅ COMPLETE | — |
| 1.5 | *(n/a — backend has no 1.5)* | ✅ COMPLETE (visual polish) | — |
| 2 | ✅ COMPLETE (40/40 tests) | ✅ COMPLETE *(fixed — see §3 below)* | — |
| 3 | ✅ COMPLETE (149/149 tests — 54 original + `GET /api/approvals` addendum, see BUILD_LOG.md) | ✅ COMPLETE *(code-complete — see FRONTEND_LOG.md's Session 3 entry for the one open item: no live browser click-through yet, Postgres wasn't installable in the build sandbox)* | — |
| 3.5 | ✅ COMPLETE (repo reorg only, no new features) | — | — |
| 4 | ✅ COMPLETE (69/69 tests) | ✅ BUILT — pending browser click-through (see FRONTEND_LOG.md Session 4) | — |
| 5 | ✅ COMPLETE (100/100 tests) | ✅ COMPLETE (Messages/notes, progress photos, shipments, warranty claims — tabs in `CaseDetailPage.tsx`, see `frontend/FRONTEND_LOG.md`) | — |
| 5.5 | ✅ COMPLETE (118/118 tests, commit `0efddfa`) | ⬜ NOT STARTED | **✅ YES — ready now** |
| 6 | ✅ COMPLETE (144/144 tests — see §9) | ⬜ NOT STARTED | **✅ YES — ready now** |
| 7 | ✅ COMPLETE (174/174 tests, commit `a32fd77` — table was stale, corrected here per this doc's own §1 precedent: verify against `git log`, not prior table state) | ⬜ NOT STARTED | **✅ YES — ready now** |
| 8 | ✅ COMPLETE (192/192 tests, commit `c787e86`) | ⬜ NOT STARTED | **✅ YES — ready now** |
| 9 | ✅ COMPLETE — **last session of the 9-session backend plan** (integration pass + security hardening review, 193/193 tests — see `BUILD_LOG.md`'s Session 9 entry) | ⬜ NOT STARTED | **✅ YES — ready now** |

**Backend plan closed as of Session 9.** There is no Session 10 in this
numbered plan (see `SESSION_9_PROMPT.md`'s header note). Due-date alerts
(Module 4), live reports (Module 12), rate limiting, CORS origin
restriction, and refresh-token revocation are all real, confirmed gaps —
each needs its own separately-scoped session going forward, not a slot in
this table.

**Stale as of Frontend Session 5 — see the table above, not this
paragraph.** This paragraph originally said "frontend hasn't started
building against [Sessions 3-5] yet"; that's no longer true (Frontend
Sessions 3, 4, and 5 are all ✅ COMPLETE per the table). Left as-is below
rather than rewritten, per this doc's own convention of correcting the
record in place instead of silently editing history — but don't read the
prose below as current status; read the table.

~~**Headline finding: backend is 3 full sessions ahead of frontend.**
Sessions 3, 4, and 5 are backend-complete, tested, committed, and pushed
— frontend hasn't started building against any of them yet. This is the
actual opportunity for parallel work: backend can move on to Session 6
while frontend spends the next few sessions catching up against
already-finished, already-tested backend work — nobody needs to wait on
anybody for Sessions 3-5.~~

---

## 3. Frontend Session 2 — what actually happened (for context)

Backend Session 2 landed cleanly. Frontend Session 2 was committed
(`ee0208b`) with `CaseQueuePage.tsx`/`CaseDetailPage.tsx`/`NewCaseModal.tsx`
fully written — but `App.tsx` was never updated to route to them,
`navConfig.ts` never un-stubbed them, `lib/api.ts` never got the
functions those pages called, and `FRONTEND_LOG.md` was never updated to
flag any of this. The gap sat live and undetected across multiple later
sessions. Fixed via 3 patches (routing/API functions, visual parity,
corrected log entry) — full detail in `frontend/FRONTEND_LOG.md`'s
Session 2 entry. This is now closed, verified with a live login +
click-through, not just a build check.

**Why this matters for parallel builds:** this is exactly the failure
mode this protocol exists to prevent — a session can look "done" (files
exist, commit made) while actually being unreachable in the running app.
Section 5's checklist below exists specifically to make sure the next
session that finishes doesn't repeat this.

---

## 4. Former blocker: Session 5.5 — resolved, closed out in commit `0efddfa`

Backend Session 5.5 originally added `patients` (migration `0023`) and
`invoices.due_date`/`tax_amount`/`paid_date` (migration `0024`) as
**migrations only**, with `patients.controller.js`/routes and the
`patient_id` backfill left open (see `BUILD_LOG.md`'s Session 5.5 entry
for that history). That gap is now closed: commit `0efddfa` added
`patients.controller.js` + `patients.routes.js` (mounted at
`/api/patients` in `app.js`) and `0025_backfill_case_patient_id.js`,
backfilling `cases.patient_id` from the legacy flat field. Verified
directly against `git log`/`git show --stat`, not just the commit
message — full suite 118/118 passing, 10/10 suites.

**Still worth confirming before building against it (per §5's rule —
don't trust a log's claimed number without running it):** pull fresh,
`npm test`, and hit `GET /api/patients` plus a real invoice response
directly to confirm `dueDate`/`taxAmount`/`paidDate` casing before
wiring a frontend screen to them. But there is no longer a known open
item blocking this — Sessions 3/4/5/5.5 are all backend-complete and
safe to build against.

---

## 5. The Rule: When Is a Frontend Session Allowed to Start?

Don't start Frontend Session N just because this table says backend
Session N shows ✅. Confirm, in this order:

1. **Pull the backend repo fresh**, `cd backend`, `npm install`,
   `npm run migrate:up`, `npm run seed`, `npm test` — confirm the test
   count matches what `BUILD_LOG.md` claims for that session. Don't
   trust the log's claimed number without running it, per §1's lesson.
2. **Hit the real endpoint(s)** the frontend session needs, directly
   (curl or browser devtools) — confirm response casing and shape
   against the actual running backend, not `Armature_Labs_Master_Blueprint.md`'s
   schema description or the build prompt's guessed shape. This project
   has already had casing surprises (camelCase vs snake_case) called out
   explicitly in the frontend plan — don't assume, check.
3. **Check `backend/src/routes/*.routes.js` directly** for the exact
   path and method before writing a single fetch call.
4. Only then start building.

## 6. The Rule: When Is a Frontend Session Allowed to End?

1. `tsc -b`/`npm run build` clean, zero errors.
2. **Grep for every new component's import** somewhere outside its own
   file. A file existing is not a feature being live — this is the
   literal Session 2 mistake, don't repeat it.
3. **Actually click through it in a running browser** against the real
   backend (`npm run dev` both sides) — not just a build check. Log in,
   navigate to the new screen via its real nav item (not by typing the
   URL directly), confirm it isn't silently still showing "Coming soon."
4. **Update `frontend/FRONTEND_LOG.md`** — no exceptions, no "this one's
   too small to bother." This is what let Session 2's gap go unnoticed
   for multiple sessions.
5. **Update this file's status board** (§2) to reflect the new state.
6. Commit + push, referencing this protocol if a decision was made on
   an ambiguous point (mirrors both logs' existing "record decisions"
   convention).

## 7. The Rule: When Is a Backend Session Allowed to End?

Same as backend's own existing convention in `BUILD_LOG.md` — `npm test`
green, migrations tested up AND down, `BUILD_LOG.md` updated, commit +
push. One addition specific to parallel-build coordination:

- **If a session is schema-only / not fully wired (like 5.5), say so
  explicitly in both `BUILD_LOG.md` and this file's status board** —
  mark it ⚠️ PARTIAL, not ✅ COMPLETE, and name exactly what's still
  open (controller, backfill, etc.). A partial session marked complete
  is what created the Session 5.5 blocker in §4 — the schema note
  itself was clear about this, but it's easy to miss if this status
  board just said "✅" without the caveat.

---

## 8. Immediate Recommended Next Actions

**Backend:** Session 6 (Phase 3 inventory/procurement/practice-CRM) is
now complete — see §9 below and `BUILD_LOG.md`'s Session 6 entry. Next up
per the 9-session plan: Session 7.

**Frontend:** Session 3 (Approvals UI) is next in sequence and has
zero blockers — Backend Session 3 is complete, tested (part of the
100/100 passing suite), committed, and pushed. Before starting: confirm
the `approvals` endpoint shapes directly against
`backend/src/controllers/approvals.controller.js` and
`backend/src/routes/cases.routes.js`'s `/media` mount (Session 3 built
media upload as `POST /api/cases/:id/media`, not a separate approvals
upload route — confirm this against the source, not this summary, per
§5 rule 2).

Frontend Sessions 4, 5, and 6 are also unblocked and can follow
immediately after — the backend for all four is already done. This is
the real parallel-work opportunity: four frontend sessions' worth of
already-finished backend to build against, no need to wait on the
backend side at all for that stretch.

---

## 9. Session 6 summary (Phase 3 Inventory & Procurement + Practice CRM)

Backend-only. Added `material_categories`, `materials`, `vendors`,
`purchase_orders`, `purchase_order_items`, `material_stock_transactions`,
`practice_contracts`, `practice_notes` (8 of Phase 3's 13 tables —
`saved_reports`/`equipment`/`technician_shifts` deferred). New routes:
`/api/inventory/*`, `/api/procurement/*`, and `/api/practices/:id/contracts`
+ `/notes`. Full detail, including the role-gating decisions made without a
client answer on file, is in `BUILD_LOG.md`'s Session 6 entry — read that
before building frontend against any of this, same as §5 requires for
every prior session.

Verified: baseline (118/118) reconfirmed on a fresh clone before starting;
all 4 new migrations tested up and down; full suite after = **144/144
passing, 13/13 suites**. No known open items — this session is fully
closed, not partial (see §7's rule on marking partial sessions honestly).

---

## 10. Sandbox Constraints (when Claude/an AI assistant is doing the building)

Read this before starting a session if you're an AI assistant working from
a sandboxed environment without direct repo write access or a runnable
Postgres — both are common enough (no persistent push credentials, no apt
mirror that resolves) that it's worth stating the resulting workflow once
here instead of re-discovering it, and re-explaining it to the human, every
single session.

**No push credentials.** Assume the sandbox can `git clone` (read) but not
`git push` (write). Build the session normally — code, `tsc -b`/build,
commit locally — then package the result as a `git format-patch --stdout`
patch (preferred: small, git-native, preserves commit messages) plus a zip
of just the changed/added files (fallback, for manual copy-in). Hand both
to the human with the exact `git checkout <branch> && git pull && git am
<patch>` sequence. **Every new patch for the same session supersedes the
previous one for that session** — if visual fixes, review feedback, or bug
fixes land in a follow-up commit, repackage and reship both files with all
commits included; don't make the human track which of several old patches
is current. Say explicitly, every time: "this replaces the earlier
patch/zip, discard those."

**No runnable Postgres.** If `apt-get install postgresql` 404s or otherwise
fails in the sandbox, that's an environment problem, not something to work
around by skipping verification silently. What's still fully doable without
a database: `tsc -b` / `npm run build`, grepping every new component's
import outside its own file (the Session 2 checklist item), and a direct
line-by-line visual audit against the reference demo (colors, fonts, exact
pixel values — all doable by reading files, no running app needed). What's
**not** doable: starting the backend, hitting real endpoints, or an actual
browser click-through. Say so plainly in the log entry (see the honesty
precedent in `FRONTEND_LOG.md`'s Session 3 entry) rather than implying
full verification happened. The click-through step in §6 rule 3 always
falls to the human, after they've applied the patch and pushed — that's a
permanent division of labor here, not a one-off gap to chase closed.

**Division of labor, stated plainly:** the sandboxed assistant builds,
typechecks, greps for wiring, and visually audits against the reference.
The human applies the patch, runs the backend, clicks through the real UI,
and pushes. Neither side should expect the other to cover its half.
