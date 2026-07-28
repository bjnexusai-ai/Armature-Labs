/**
 * Live click-through on Session 7's Dashboard surfaced a real bug: the
 * hero card's "Due" field showed "Invalid Date". Root cause confirmed
 * against the backend, not guessed —
 *
 * `backend/migrations/0006_cases.js` defines `due_date` as a Postgres
 * `date` column (`notNull: true` — it's never actually null). But
 * `cases.controller.js`'s SELECT never casts it `::text` the way
 * `equipment.controller.js` does for its own date columns (that
 * controller's own header comment explicitly flags this exact class of
 * bug and names `accounts.controller.js`'s `contract_start_date` as
 * another instance — `cases.controller.js`'s `due_date` is a third,
 * previously uncaught one). Without the cast, `pg` returns a JS `Date`
 * object and `res.json()` serializes it as a full ISO timestamp
 * (`"2026-08-06T00:00:00.000Z"`), not the bare `YYYY-MM-DD` the frontend
 * type comment and every consumer assumed.
 *
 * `${dueDate}T00:00:00` on an already-full ISO string produces
 * `"2026-08-06T00:00:00.000ZT00:00:00"` — `new Date()` on that is
 * `Invalid Date`. This is a backend Session 2 issue (out of Session 7's
 * scope to fix server-side), so this file makes every frontend consumer
 * of `CaseRecord.due_date` robust to either shape instead, rather than
 * leaving the frontend broken until a future backend session adds the
 * missing cast.
 */
export function parseFlexibleDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const raw = value.includes('T') ? value : `${value}T00:00:00`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
