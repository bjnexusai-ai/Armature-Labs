# Session 6 — Part 2 of 2: Pages, routing, nav wiring, logs

**Requires Part 1 to already be applied** — these pages import the
types/api functions/components that shipped in
`armature-labs-session6-part1-foundation.zip`.

## What's in this zip

```
frontend/src/pages/MaterialsPage.tsx            (NEW)
frontend/src/pages/MaterialDetailPage.tsx        (NEW)
frontend/src/pages/PurchaseOrdersPage.tsx         (NEW)
frontend/src/pages/PurchaseOrderDetailPage.tsx     (NEW)
frontend/src/pages/PracticesPage.tsx                (NEW)
frontend/src/pages/PracticeDetailPage.tsx            (NEW)
frontend/src/lib/navConfig.ts        (REPLACES — materials flipped live,
                                       procurement + practices nav items added)
frontend/src/layouts/AppShell.tsx    (REPLACES — procurement + practices
                                       icon paths added)
frontend/src/App.tsx                 (REPLACES — 6 new routes wired)
frontend/FRONTEND_LOG.md             (REPLACES — Session 6 entry appended)
PARALLEL_BUILD_PROTOCOL.md           (REPLACES — status board row 6 updated)
```

## How to apply

1. Apply Part 1 first if you haven't already.
2. Unzip this into the repo root the same way:
   `unzip -o armature-labs-session6-part2-pages-and-wiring.zip -d Armature-Labs/`
3. All files listed above are **full replacements**, not patches.
4. Once both parts are applied, run:
   ```
   cd frontend && npm install && npx tsc -b && npm run build
   ```
   This was confirmed clean (zero errors) in the build sandbox before these
   zips were created. If it's NOT clean after you apply both parts, diff
   against what's here before assuming the code is wrong — a partial apply
   (e.g. only some files from one part) is the most likely cause.
5. Commit + push both parts together as one commit — don't commit Part 1
   alone, it would leave dead/unreachable code in the tree (the exact
   Session 2 mistake this project's own conventions warn against).

## Verification already done (see FRONTEND_LOG.md's Session 6 entry for full detail)

- `tsc -b` and `npm run build`: clean, zero errors.
- Grepped every one of the 14 new components for an import outside their
  own file — all confirmed wired, none are dead code.

## Verification NOT done (no runnable Postgres in the build sandbox)

- No live browser click-through against a real backend yet. See
  FRONTEND_LOG.md's "How to pick this up" section for the exact
  click-through checklist (login as owner, exercise Materials/
  Procurement/Practices, confirm role-gating for a non-manager login).

## After this is applied and click-tested

Frontend Session 6 is closed. Session 7 (saved reports/dashboards,
equipment + technician scheduling) is next — its backend is already
complete (174/174 tests, commit `a32fd77`).
