# MOBILE_LOG.md

Follows the same convention as `BUILD_LOG.md` and `FRONTEND_LOG.md` in
this repo. Updated at each mobile session.

---

## M1 — Expo app shell

**Depends on:** B11 (MFA). B11 was not complete at the time of this
session — see "Known gaps against plan" below.

**Delivered:**

- Expo SDK 57 / React Native 0.86 project, TypeScript, `expo-router`
  (file-based routing, typed routes enabled).
- `src/theme/theme.ts` — full design-token translation of plan §4
  (colors, status badge tones, Plus Jakarta Sans / Inter / IBM Plex Mono
  via `@expo-google-fonts`, spacing, radius, shadow). No values invented;
  everything traces back to the table in the plan doc.
- Auth flow, full state machine in `src/lib/auth/AuthContext.tsx`:
  `loading -> signedOut -> mfaPending -> deviceLockPending -> signedIn`.
  - `login()` — calls `/api/auth/login`, branches on `mfaRequired`.
  - `verifyMfa()` — calls `/api/auth/mfa/verify` (**path assumed**, see
    gaps below).
  - Device PIN/biometric gate via `expo-local-authentication`, shown on
    cold start and again after >60s backgrounded (interim constant,
    not a client-confirmed number — see gaps).
  - `logout()` — calls `/api/auth/logout`, best-effort (doesn't block
    local sign-out if the revoke call fails).
- `src/lib/secureStorage.ts` — all tokens/profile in `expo-secure-store`,
  `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Nothing token-related touches
  AsyncStorage or any non-secure store.
- `src/lib/api.ts` — shared fetch client: attaches bearer token, single
  coalesced refresh-and-retry on a 401.
- Role-based nav: `app/(app)/_layout.tsx` renders bottom tabs
  (Cases / Approvals / Invoices / Notes) only for office-facing roles
  (`dentist`, `office_manager`, `office_staff`). Lab-internal roles see
  a "not available on mobile" screen instead of a broken tab bar —
  per plan §5, mobile is dental-office-facing only.
- Placeholder screens for all four tabs — shell only, no mock data.
  Real content is M2.
- Verified: `npx tsc --noEmit` clean, `npx expo-doctor` clean (aside from
  one check that requires outbound network to Expo's API, unavailable in
  the build sandbox — not a project issue).

**Known gaps against the plan — flagged, not silently resolved:**

1. **B11 not complete.** `mfaVerify` / `mfaEnroll` / `mfaRecovery`
   endpoint paths in `src/constants/endpoints.ts` are my best guess from
   the plan's own naming, not confirmed against a real B11 delivery.
   Enrollment flow (QR/secret display) isn't built — verify-only. The
   recovery-code button on the MFA screen is a visible no-op, intentionally,
   rather than wired to a guessed endpoint.
2. **Device-lock re-lock window (60s)** is an interim default — the plan's
   open item §6.1 only covers refresh-token idle timeout (proposed 7
   days, unconfirmed), not device-lock timing. Make this configurable
   once the client has an opinion.
3. **Background gradient** (`#EAF7F5` → `#FCFCFB` in the web portal) is
   rendered as a flat `#EAF7F5` on mobile — no `expo-linear-gradient`
   dependency pulled in for M1 just for this. Easy follow-up if flagged.
4. **B10 dependency**: refresh-token revoke-on-logout, rate limiting on
   `/api/auth/login`, and the `refreshTokenExpiresAt` field in the login
   response are all called/read by this code as if B10 already shipped.
   If B10's actual contract differs, `src/lib/api.ts` and
   `src/lib/auth/AuthContext.tsx` are the two files to check.

**Not started (by design, later sessions):** camera capture (M3), push
registration (M3), approvals/invoices UI (M4), screenshot/clipboard
protection (M5), CORS tightening (M5).

---

## M2 — Case list, case detail, media (read-only), notes thread

**Before writing any M2 code, cloned the live repo**
(`github.com/bjnexusai-ai/Armature-Labs`, `main`) and read the actual
migrations, controllers, and routes rather than building against the
plan doc's endpoint names alone. This surfaced several mismatches
between M1's assumptions and the real backend — all fixed as part of
this session, not carried forward silently:

**Fixes to M1's foundation (not new M2 work, but corrected now):**
1. **Role model was wrong.** M1 invented `dentist` / `office_manager` /
   `office_staff` as office-facing roles. The real backend seeds
   `owner`, `office_manager`, `assistant_technician`, `designer`,
   `dentist_client` — and confusingly, `office_manager` is a
   **lab-internal** role (full internal access incl. billing), not a
   dental-office role. The only office-facing/portal role is
   `dentist_client`. `src/constants/roles.ts` rewritten accordingly.
2. **B10 has actually shipped** (refresh_tokens table, rotation,
   reuse-detection, rate limiting on `/api/auth/login` — all confirmed
   in `auth.controller.js`). M1's "B10 not done" hedge is stale.
   However, the field name I'd guessed was wrong: login returns
   `refreshExpiresIn` (seconds from now), not `refreshTokenExpiresAt`
   (ISO string). `refresh()` itself returns only
   `{ accessToken, refreshToken }` — no expiry field, and the refresh
   token **rotates on every call** (old jti marked 'rotated', reuse of
   an old token revokes the whole session). `src/lib/auth/types.ts`,
   `AuthContext.tsx`, `secureStorage.ts`, and `api.ts` all updated to
   match.
3. **B11 (MFA) still has not shipped** — no `mfa.*` routes exist on the
   backend. Rather than leave M1's speculative MFA screen wired to
   guessed endpoint paths indefinitely, removed it: `app/(auth)/mfa.tsx`
   deleted, `mfaPending` removed from `AuthState`. Reintroduce once B11
   ships its real contract — don't guess it again.
4. **Case status list confirmed** — the 10-status lifecycle in
   `backend/src/utils/caseStatus.js` matches the plan doc exactly.
   Added `src/constants/caseStatus.ts` with the real enum and a
   documented (mobile-side, not backend-specified) badge-tone mapping.

**Real gap found — changes M2's "media gallery" scope:**

There is **no `GET` endpoint for case media at all**. `POST
/api/cases/:id/media` (`uploadCaseMedia`) exists but is
`requireInternal` — a `dentist_client` can never call it, and there's
no corresponding list route. The only real read path to case media for
a portal user is `GET /api/approvals?caseId=X`, which joins each
design/bisque approval to its file (`media_file_name`,
`media_file_url`). Progress photos (`progress_photos` table, other
`case_files.media_stage` values like `pickup_form`/`pre_treatment`)
are lab-staff-only end to end and are genuinely not visible to mobile.

**Decision:** built the "media gallery (read-only)" requirement against
`GET /api/approvals?caseId=X` instead of a nonexistent media-list
endpoint. This shows design/bisque review photos with their approval
status — which covers the actual client-facing use case (reviewing
photos sent for approval) even though it's not literally "every file
on the case." Flagging this explicitly rather than either (a) building
against a fake endpoint or (b) silently shipping an empty gallery.
`src/components/case/MediaGallery.tsx` documents this inline too.

**Also found:** no cross-case notes feed exists — `case_notes` is
scoped to one case at a time (`/api/cases/:id/notes`), no "all my
practice's notes" endpoint. M1's placeholder had invented a standalone
"Notes" tab; removed it. Notes now live inside case detail, which is
also what the plan doc's M2 row actually asked for ("client-visible
notes thread" as part of case detail, not its own tab).

**Delivered:**

- `src/lib/useApi.ts` — shared read hook (fetch-on-mount, pull-to-
  refresh, normalized error messages by status code). Every list/detail
  screen goes through this.
- `src/types/domain.ts` — response shapes transcribed field-for-field
  from the real controller SQL (`CaseSummary`, `CaseDetailResponse`,
  `CaseNote`, `Approval`, etc.) — not guessed.
- `app/(app)/cases/index.tsx` — case list, `GET /api/cases` (already
  tenant-scoped server-side for `dentist_client`; portal users get a
  400 if they pass `practiceId`, so no client-side filter param is
  sent), status badges via the real 10-status enum, pull-to-refresh,
  empty/error states.
- `app/(app)/cases/[id].tsx` + `cases/_layout.tsx` — case detail (Rx
  instructions, current stage, priority), composed with:
  - `src/components/case/MediaGallery.tsx` — approvals-backed media
    view, per the gap above.
  - `src/components/case/NotesThread.tsx` — read + post. Backend
    forces every `dentist_client` note to `visibility: 'portal'` and
    already filters `GET .../notes` to portal-only for this role, so
    no client-side visibility logic is needed — confirmed in
    `notes.controller.js`, not assumed.
- Removed the top-level Notes tab (see gap above); `(app)/_layout.tsx`
  now has three tabs (Cases / Approvals / Invoices), Approvals and
  Invoices still M1-style placeholders correctly labeled "ships in M4."
- Verified: `npx tsc --noEmit` clean, `npx expo-doctor` clean (same
  network-blocked schema check as M1, not a project issue).

**Not started (by design, later sessions):** camera capture/upload,
push registration (M3 — `device_push_tokens` endpoint path in
`endpoints.ts` is still unconfirmed, check before M3), approvals
approve/request-changes UI, invoices (M4 — `invoices` endpoints in
`endpoints.ts` are still unconfirmed, check before M4).

---

## M3 — Camera capture, HEIC→JPEG conversion, push notifications

**Before writing any M3 code**, cloned the live repo (`main`) again and
re-checked the two things the M3 brief specifically flagged rather than
trusting the plan doc or M2's own notes at face value:

1. **`device_push_tokens`** — grepped `backend/migrations` and
   `backend/src` for any trace of it. None exists: no migration, no
   table, no route. B10 on `main` is still refresh-token
   revocation/rotation + rate limiting only, same as M2 found.
2. **Case media submission for `dentist_client`** — re-read the actual
   controllers, not just route names:
   - `POST /api/cases/:id/media` (`uploadCaseMedia`) — `requireInternal`,
     confirmed staff-only.
   - `POST /api/cases/:id/notes` — zod `.strict({ body, visibility })`,
     no attachment field.
   - `POST /api/approvals/:id/approve` and `/:id/request-changes` — zod
     `.strict({ comments })` (approve) / `.strict({ comments })`
     (request-changes), no attachment field either.

   So there is **no endpoint anywhere** a `dentist_client` can call to
   submit a photo. Per the brief's own fallback plan, camera capture in
   M3 is built up to "have a converted image, ready to send" and stops
   there — it does not attach to `case_files`, notes, or approvals,
   because none of those three accept a file. Flagging this loudly here
   rather than building a capture flow that silently 403s.

**Delivered:**

- `src/lib/media.ts` — `captureCasePhoto()` / `pickCasePhotoFromLibrary()`
  via `expo-image-picker` (permission request built into each call).
  Every asset — regardless of reported `mimeType` — is unconditionally
  re-encoded through `expo-image-manipulator`'s current
  `ImageManipulator.manipulate(uri).renderAsync().saveAsync({ format:
  SaveFormat.JPEG })` API (not the deprecated `manipulateAsync`,
  confirmed against the installed package's own `.d.ts` files before
  using it — not from memory, since this API changed recently). This
  means HEIC input is guaranteed converted before anything downstream
  ever sees the file, verified in code rather than assumed to work off
  file extension.
- `src/lib/casePhotoQueue.ts` — in-memory, session-scoped store for
  captured photos. `submitPendingPhoto()` is an explicit no-op (logs and
  returns) — see gap #2 above. `TODO(backend)` comment marks exactly
  what to change once a real endpoint exists.
- `src/components/case/PhotoCapture.tsx` — "Take photo" / "Choose from
  library" buttons, thumbnail grid of what's been captured, plain-
  language copy telling the dentist office the photo is saved on-device
  only and can't reach the lab yet. Wired into `cases/[id].tsx` as a new
  "Add photo" section between Media and Notes — no new top-level screen,
  per the brief.
- `src/lib/push.ts` — `registerForPushNotificationsAsync()`:
  `expo-device`'s `Device.isDevice` guard, `expo-notifications` permission
  request, then `getExpoPushTokenAsync`. Found a second real gap here:
  this project has never run `eas init`, so `app.json` has no
  `extra.eas.projectId` — required by `getExpoPushTokenAsync`. Rather
  than invent a project id, the function checks for it and returns a
  clear `unavailable` reason instead of letting the native call throw.
  `submitDevicePushToken()` is a stub for the same reason as gap #1
  (endpoint doesn't exist) — logs the retrieved token instead of
  POSTing it anywhere.
- `src/hooks/usePushNotifications.ts` — foreground/background tap
  listener (`addNotificationResponseReceivedListener`) plus cold-start
  handling (`getLastNotificationResponse`), all deep-linking to
  `/(app)/cases/[id]` via `router.push({ pathname, params })`. Wired into
  `app/(app)/_layout.tsx` so it only ever runs for a signed-in,
  office-facing session.
  - **Payload shape caveat, flagged not guessed:** `backend/src/services/
    notifications.js`'s `notify()` is itself fully stubbed — no email/
    SMS/push provider is wired up yet, it just logs and returns. So
    there is no real delivered push payload to check the shape of. What
    *is* confirmed is that every `notify()` call a `dentist_client`
    would ever receive (`approval_requested`, `lab_note_created`) passes
    `payload.caseId` consistently — the deep-link reads `data.caseId` on
    that basis. Re-verify once a real push provider is wired up and
    B10/whatever ships the actual send.
- `app.json` — added Android `READ_MEDIA_IMAGES` permission and an
  `expo-image-picker` config plugin entry (camera + photo library usage
  strings for iOS, mirrors the existing `NSFaceIDUsageDescription`
  pattern from M1).

**Verified:** `npx tsc --noEmit` clean. `npx expo-doctor` — same single
check fails as M1/M2 (Expo config schema check requires outbound network
to Expo's API, unavailable in this build sandbox; not a project issue),
everything else passes.

**MOBILE_LOG summary — confirmed vs. stubbed, per the brief's acceptance
check:**
- `device_push_tokens` (token submission): **stubbed.** Confirmed not to
  exist on the backend. `submitDevicePushToken()` no-ops.
- Media upload target: **stubbed, and confirmed there is no viable
  target at all** (not just "unconfirmed path" — checked all three
  candidate endpoints and none accepts a file). `submitPendingPhoto()`
  no-ops.
- Push permission request, token retrieval, and tap-to-deep-link: **real
  and wired**, independent of the two stubs above.
- HEIC→JPEG conversion: **real, unconditional, verified against the
  installed package API.**

**Not started (by design, later sessions):** approvals approve/request-
changes UI, invoices (M4 — `invoices` endpoints in `endpoints.ts` are
still unconfirmed, check before M4), screenshot/clipboard/background-blur
protection, CORS tightening, store submission prep (M5).

---

## M4 — Approvals UI (Approve / Request Changes), invoices

**Before writing any M4 code**, cloned the live repo (`main`, commit
`67abc4b1`) fresh and re-checked the two things the M4 brief specifically
flagged, rather than trusting the plan doc, `endpoints.ts`'s own prior
guess, or M3's notes at face value:

1. **Invoices base path** — grepped `backend/src/app.js`: confirmed
   `app.use('/api/billing', billingRoutes)`. `endpoints.ts`'s `invoices`
   entry was pointing at `/api/invoices` (marked `NOT YET CONFIRMED` since
   M2), which is wrong and has never been right. Fixed to
   `/api/billing/invoices` / `/api/billing/invoices/:id`.
2. **Invoice read-access gating** — read `billing.routes.js`'s
   `requireInvoiceReadAccess`: for `dentist_client` it resolves to
   `requirePortalPermission('can_view_invoices')`; for internal staff,
   `requireBillingAccess` (owner/office_manager only — not mobile's
   concern, mobile is always `dentist_client`). Matches the brief exactly.

**A third thing, not in the brief, found while reading the controller
rather than assumed:** `migrations/0024_invoice_client_fields.js` added
`due_date`, `tax_amount`, and `paid_date` columns to `invoices` — closing
a gap against the client's own docx §8 field list (`due_date`,
tax/subtotal/total, `paid_date`). But none of the three controller
functions that touch invoices (`listInvoices`, `getInvoice`,
`createInvoice`) select, insert, or update any of the three. The columns
exist in Postgres; the API never surfaces them. This means the invoice
detail screen has no due date and no separate tax line to show — not
because mobile skipped them, but because there's nothing in the response
to show. **Flagging this as a backend gap**, not silently working around
it with a guessed field name or a client-side default of `0`/`null` that
would look like real data. Whoever owns Session 8/9 follow-up should
decide whether to wire these into the SELECTs (client-approved) or drop
the unused columns.

**Delivered:**

- `src/constants/endpoints.ts` — invoices path fixed as above; added
  `invoiceCheckoutSession` (confirmed real per `stripe.routes.js`, kept
  unused/documented rather than re-guessed later); added `approvalsList`
  (`/api/approvals?limit=100`) for the Approvals tab — `listApprovals`
  defaults to `limit=25` server-side (confirmed in the zod schema) and
  this session isn't building pagination UI, so asking for the max
  allowed (`100`, also zod-enforced) avoids silently truncating a
  practice's open approvals rather than building real pagination.
- `src/types/domain.ts` — `InvoiceStatus`, `InvoiceSummary`,
  `InvoicesListResponse`, `InvoiceLineItem`, `InvoicePayment`,
  `InvoiceDetail`, `InvoiceDetailResponse`, all transcribed from
  `billing.controller.js`'s real SELECTs (not the full DB schema — see
  the gap above). Two things worth flagging for future sessions reading
  this file:
  - `InvoiceSummary` deliberately has no `notes` field — the
    `dentist_client` branch of `listInvoices` doesn't select it (only the
    internal-staff branch does). Not an oversight.
  - `listInvoices`/`InvoicesListResponse` has no `pagination` block,
    unlike `/api/cases` and `/api/approvals` — the real response is a bare
    array. Don't add one speculatively.
  - Money fields (`subtotal`, `amount_paid`, `unit_price`, `line_total`,
    `payments.amount`) are typed `string`, not `number` — confirmed
    `config/db.js` has no custom `pg` type parser, so `numeric(10,2)`
    columns come over the wire as strings. `quantity` is a real integer
    column and is typed `number`.
- `src/lib/api.ts` — fixed a real bug while wiring the approve/
  request-changes mutations: `apiRequest`'s error path was surfacing the
  *raw response text* as the error message, not the parsed JSON. Every
  backend error response is `{ error: string }` (confirmed against
  `middleware/errorHandler.js`), so a 409 like "This approval has already
  been responded to..." was showing up as an unparsed JSON blob. Now
  parses it, falling back to raw text/statusText only if the body isn't
  JSON. Also added `mutationErrorMessage()` — a write-path counterpart to
  `useApi.ts`'s read-tuned `messageFor`, with its own 409 case ("already
  responded to" is a real, expected outcome here, not a generic failure).
- `src/components/case/ApprovalActionModal.tsx` — **the actual
  approve/request-changes action UI, one implementation, two entry
  points.** The brief flagged this as an open call ("case detail or
  Approvals tab, either is defensible, don't build both half-heartedly").
  Built it as a single reusable modal (photo, stage, status, optional/
  required comments field per action, Approve / Request Changes buttons,
  409-conflict state distinct from generic error) rather than choosing
  one screen and neglecting the other. It's opened from:
  - The Approvals tab list (tap any pending row).
  - Case detail's `MediaGallery`, via a new "Respond" affordance on
    pending items (only shown when `canApprovePhotos` is true — mirrors
    the server-side gate client-side, per the brief).
  Both callers pass their own `onResponded` — case detail refetches
  *both* the case (status header) and the approvals query after a
  response, per the brief's explicit instruction not to leave the header
  stale on a local flip; the Approvals tab just refetches its own list.
- `app/(app)/approvals/index.tsx` — real screen, replacing the M1
  placeholder. `SectionList` grouped Pending / Approved / Changes
  requested, pull-to-refresh, tap opens the shared modal. Not gated on
  `can_approve_photos` for *visibility* (matches `listApprovals`'s own
  gating — visibility is practice-scoped, not permission-flag-scoped);
  the flag only suppresses the action buttons inside the modal.
- `app/(app)/invoices/_layout.tsx` (new — invoices didn't have a Stack
  layout before, only a flat placeholder) + `index.tsx` (real list,
  replacing the M1 placeholder) + `[id].tsx` (new detail screen), same
  Stack pattern as `cases/_layout.tsx`.
  - List and detail are both gated **client-side** on `canViewInvoices`:
    when false, `useApi` is given `null` and never calls the endpoint at
    all — the person sees a plain "no permission" state, never the
    backend's 403.
  - Detail shows subtotal / paid / balance, line items, and payments.
    Read-only: no "Pay now" button, no Checkout UI.
- `app/(app)/cases/[id].tsx` — wired the modal in (see above); no other
  structural change to this screen.

**Stripe Checkout UI — explicitly still out of scope, not silently
skipped.** Plan §6 item 5 ("whether Stripe Checkout UI is in scope for
mobile M4") was never answered by the client before this session started.
`POST /api/billing/invoices/:id/checkout-session` is confirmed real and
gated identically to invoice reads, but building a native payment flow
around it is a scope expansion nobody signed off on. Defaulted to out of
scope per the brief; `ENDPOINTS.invoiceCheckoutSession` exists, unused,
so the path doesn't need re-deriving whenever this question does get
answered.

**Verified:** `npx tsc --noEmit` clean (zero errors). `npx expo-doctor` —
same single check fails as M1/M2/M3 (Expo config schema check requires
outbound network to Expo's API, unavailable in this build sandbox; not a
project issue), everything else (18/19 checks) passes.

**MOBILE_LOG summary — confirmed vs. still guessed:**
- Invoices base path (`/api/billing/invoices`): **confirmed against
  `main`** this session, fixed from a stale wrong guess.
- Invoice read-access gating (`can_view_invoices` / `requireBillingAccess`
  composition): **confirmed.**
- Approvals endpoints (list/approve/request-changes): **confirmed in M3,
  re-verified only at the routing level this session (unchanged), reused
  without re-deriving the body shapes or gating.**
- Invoice `due_date`/`tax_amount`/`paid_date`: **confirmed to exist in the
  DB but confirmed NOT returned by any controller** — flagged as a
  backend gap above, not guessed around.
- Stripe Checkout UI: **still an open client decision** (plan §6 item 5),
  defaulted to out of scope this session per the brief.

**Not started (by design, M5):** screenshot/clipboard/background-blur
protection, CORS tightening, store submission prep. Push-token submission
and case-photo submission remain stubbed from M3 — untouched this
session, not M4's problem.

---

## M5 — full integration pass, screen protection, CORS, security review, submission prep (final mobile session)

Re-cloned `main` before writing any code, per this session's own brief.
Two things it flagged turned out to matter more than expected — logged
first, in the order the brief asked for.

### 1. CORS — confirmed already fixed, but not deployable yet
`backend/src/app.js` already has exactly what the brief described:
`CORS_ORIGIN` (comma-separated) parsed into an allowlist, checked in a
`cors()` origin callback, and the app **refuses to boot** in
`NODE_ENV=production` without it (commit `67abc4b`, "Lock down CORS to a
configurable origin allowlist, required in production"). No code change
needed here — the fix already shipped between M4 and this session.

What's genuinely still open: `backend/.env.example` ships `CORS_ORIGIN=`
blank, and there is **no deployment config anywhere in this repo** — no
`render.yaml`, `fly.toml`, Procfile, or any hosting-platform file (checked
directly, not assumed). There is no evidence in the codebase of where this
actually runs in production, so there is no real domain to set
`CORS_ORIGIN` to yet. This is a real blocker, not a code gap — someone
with deployment access needs to say where the web portal is actually
hosted before this can be set to a real value. Confirmed not fixable from
inside this session.

### 2. Mobile origin — confirmed there is no such thing, nothing added
Per the brief: `origin` is `undefined` for non-browser requests in the
`cors()` callback, and those pass unconditionally. React Native's
`fetch()` never sends an `Origin` header, so it structurally cannot be
blocked or allowed by `CORS_ORIGIN` either way. Nothing was added for
"mobile" to that allowlist — there's nothing to add. If mobile traffic
ever needs restricting at the network layer, that's a different mechanism
(API key, cert pinning, WAF rule) and a separate, unscoped decision — not
folded into this session.

### 3. `device_push_tokens` — closed this session, not deferred a 4th time
Grepped `backend/migrations` and `backend/src/routes` fresh — still
absent, same as M2/M3/M4. Decision: close it now, this being the last
mobile session before store submission.

Built (delivered as `backend-patch/` alongside this zip, since this
session has no push access to the repo — same limitation noted every
prior session):
- `migrations/0037_device_push_tokens.js` — one row per `(user, token)`,
  upsert on `expo_push_token` (unique), not on user, so token churn
  (reinstall, OS update) replaces the old row instead of accumulating
  duplicates.
- `controllers/devicePushTokens.controller.js` +
  `routes/devicePushTokens.routes.js` — `POST /api/device-push-tokens`
  (register/upsert), `DELETE /api/device-push-tokens` (remove, scoped to
  the caller's own `user_id`).
- `APPLY.md` with the exact two-line `app.js` wiring needed and what to
  test before merging (no test file included — no runnable Postgres in
  this sandbox, same limitation as every prior session).

Wired on the mobile side: `push.ts`'s `submitDevicePushToken` is a real
call now (was a stub since M3), persists the token via `secureStorage` so
logout can revoke it, and a new `removeDevicePushToken()` fires
best-effort on explicit sign-out (`AuthContext.tsx`), mirroring B10's own
revoke-on-logout reasoning for auth tokens.

**Important caveat, stated plainly:** the backend patch is delivered as
files, not deployed. Until `backend-patch/` is applied to `main` and
shipped, `submitDevicePushToken` will 404 in production — the code path is
real and ready, the backend dependency on it is not automatically
satisfied by this session existing.

### 4. Screenshot/recording/app-switcher protection — brief's own premise was wrong, corrected
Installed `expo-screen-capture@57.0.1` and read the actual package source
(`ios/ScreenCaptureModule.swift`, `android/.../ScreenCaptureModule.kt`) —
not memory, not the brief's own assumption. Correction: **iOS is not
detection-only for this library.** It genuinely prevents screenshots too,
via a different mechanism than Android's:

- **Android**: `FLAG_SECURE` on the activity window — real OS-level
  prevention for screenshots, recordings, and the recents/app-switcher
  thumbnail, all from one call.
- **iOS**: `preventScreenCaptureAsync` swaps the key window's layer under
  a `UITextField` with `isSecureTextEntry = true` — exploiting the OS rule
  that secure text field content never appears in a screenshot, applied to
  the whole window. A screenshot taken while active comes out black, not
  just detected after the fact. Public APIs only (no App Store risk from
  private-API use), but not an Apple-documented "block screenshots"
  feature either — it's a durable, widely-used OS quirk, not an official
  guarantee. Screen *recording* (`UIScreen.main.isCaptured`) is handled
  separately, by an opaque overlay while mirroring is detected — also real
  prevention, not just a notification.
- **App-switcher blur**: iOS needs a separate call
  (`enableAppSwitcherProtectionAsync`, confirmed iOS-only — calling it on
  Android throws, confirmed by reading the Android module's own exposed
  function list). Android gets this for free from the same
  `FLAG_SECURE` call — confirmed in the package's own README.
- `addScreenshotListener` (detection) still fires on iOS even though the
  resulting image is black — kept as an audit signal only (in-memory log,
  `getScreenshotAttemptLog()` in the new `screenProtection.ts`), not as the
  primary defense.

Built: `src/lib/screenProtection.ts` (`usePatientPhotoScreenProtection`),
wired into:
- `app/(app)/cases/[id].tsx` — whole screen, for as long as it's mounted
  (protection is window-level on both platforms, not per-view — there's no
  way to protect just the media gallery and not the Rx instructions above
  it).
- `src/components/case/ApprovalActionModal.tsx` — gated on `approval !==
  null` via an `enabled` param added to the hook, since this component
  stays mounted for its parent screen's whole lifetime (visibility is
  prop-driven, not mount/unmount) and is reachable standalone from the
  Approvals tab, not only from case detail.
- **Invoices — checked, not assumed:** invoice detail shows line items,
  totals, and payment status only, no images (confirmed against
  `Invoice`/`InvoiceLineItem` types and the screen itself) — no protection
  added there, per the brief's own "check, don't assume" instruction.

**Not verified on a physical device or simulator** — this sandbox can't
run iOS or Android natively. The textfield-layer technique's exact visual
behavior should be confirmed on a real device before shipping, same as any
OS-quirk-dependent technique; flagging this explicitly rather than
implying device verification happened when it didn't.

**Clipboard:** checked for an existing copy/save affordance on patient
photos (`MediaGallery.tsx`, `ApprovalActionModal.tsx`) — there isn't one,
and RN's core `<Image>` component has no built-in long-press
copy-to-clipboard gesture the way a web `<img>` does. No `expo-clipboard`
dependency exists in this project. Nothing to lock down that isn't already
true by default — documenting that finding rather than building an
unnecessary control, same pattern as the CORS finding above.

### 5. Security review
- **Token storage**: `expo-secure-store` confirmed still in use for
  access/refresh tokens (M1), unchanged.
- **Device re-lock timing**: `RELOCK_AFTER_BACKGROUND_MS` in
  `AuthContext.tsx` is still the M1-era hardcoded `60_000` interim
  default. Decision this session: **not converting to a user-facing
  setting in M5** — that's a settings screen, which is a new product
  feature and out of scope per this session's own brief. Flagging plainly
  instead: this should become configurable before general release: a
  hardcoded 60s re-lock window was reasonable as an interim default three
  sessions ago, shipping unchanged to the App Store is a decision someone
  should make on purpose, not by default.
- **File URLs**: `case_files.file_url` (backend) is a plain `varchar`, not
  a signed/expiring URL. Not a new finding this session, and fixing it is
  a storage-layer decision (S3 bucket policy, signed URLs), not a mobile
  code change — noted here so it isn't lost, but intentionally not folded
  into M5's scope.
- Screenshot-protection findings above are part of this review, not
  separate from it.

### Full plan §6 open-items rundown (final, since this is the last mobile session)
1. **Mobile session/token idle-timeout policy** (proposed 7 days) —
   still not formally confirmed by the client as of this session; the
   codebase has shipped with the 7-day default since M1 without a
   contradicting instruction. Treat as answered-by-default, not
   explicitly signed off.
2. **Offline behavior** (proposed: none for v1) — same status: shipped as
   "none" since the plan doc, never contradicted, never formally
   confirmed. No offline queue/sync exists in this codebase.
3. **Screenshot/recording prevention** — **closed this session**, built to
   the real per-platform ceiling described above.
4. **App Store / Play Store account ownership** — **still unanswered**,
   now genuinely blocking (see `STORE_SUBMISSION.md`). This is the one
   item on this list that actually stops forward progress, not just a
   carried-forward decision.
5. **Stripe Checkout UI in scope for mobile** — **still unanswered**
   across M4 and now M5. `endpoints.ts`'s unused
   `invoiceCheckoutSession` entry from M4 is untouched. Third session in a
   row this has gone unaddressed — deliberately, per each session's own
   scope, but worth the client's attention now that mobile is otherwise
   feature-complete.
6. **React Native/Expo vs. native** — treated as decided for planning
   throughout; never formally sent back to the client, same as the plan
   doc itself notes. No change this session.

Additionally, not in the original §6 list but tracked since M3/M4 and
worth closing out here: **MFA (B11)** — still not landed on the backend as
of this session; correctly out of scope for mobile regardless of backend
status.

### Full integration pass
Re-verified `Approval`, `CaseDetailResponse`, and invoice types directly
against the live controllers' SQL (`approvals.controller.js`,
`cases.controller.js`, `billing.controller.js`) rather than trusting
`domain.ts`'s own comments. No drift found — M2–M4's types are accurate.
`invoices.due_date`/`tax_amount`/`paid_date` are still confirmed absent
from the controller response (re-checked, not assumed stale) — same gap
M4 flagged, still true, not fixed this session (a backend controller
change, not integration-pass scope).

### Build verification
- `npx tsc --noEmit` — clean.
- `npx expo-doctor` — 18/19 checks pass; the one failure is the same
  network-blocked config-schema check every prior session has hit
  (sandbox can't reach Expo's schema-validation service), not a real
  finding.

### Store submission prep
See `STORE_SUBMISSION.md` for the full breakdown. Summary: Data
Safety/App Privacy answers, age-rating estimate, and an `eas.json`
**template** (placeholders, not run through `eas init`) are done.
Genuinely blocked: privacy policy (needs legal/business input, not
drafted as a placeholder), `eas init` itself (needs a real Expo
account), real screenshots (needs a running build), and submission itself
(needs Apple/Google account ownership answered).

### Acceptance check
- `CORS_ORIGIN`: mechanism confirmed correct; real value blocked on a
  production domain/deployment-config answer — not something this
  session can supply.
- Screenshot/clipboard/background-blur: built to the real, verified
  per-platform ceiling; no copy anywhere implies iOS "only detects."
- `device_push_tokens`: closed, with an explicit backend-patch delivery
  and a plainly-stated deployment caveat — not a fourth stub note.
- Store submission: done/blocked split is explicit in
  `STORE_SUBMISSION.md`.
- This entry includes the full plan §6 rundown, not just what M5 itself
  touched.

## Addendum — directory placement fix (2026-07-29)

Found during a full end-to-end repo gap audit: when M5's delivery was
applied to the repo, this entire tree (M2 through M5 — everything above
this line) landed at `mobile/mobile-M5/mobile/` instead of overwriting
the stale M1 shell at `mobile/`. Net effect: `mobile/` — the path anyone
would actually `cd` into — was frozen at M1 (login/nav/biometric shell
only) while the real, finished app sat three folders deep and invisible
unless you already knew to look there. Not an error in M5's own work
(confirmed: the M5 session's own delivery notes above describe a normal
zip handoff, same "no push access" limitation every session has had) —
this was an apply-time mistake.

**Fixed:** promoted every file from `mobile/mobile-M5/mobile/` up to
`mobile/` (the two M1-only files it correctly superseded —
`app/(auth)/mfa.tsx`, `app/(app)/notes/index.tsx` — were already
documented as deliberately removed in M2's own entry above, not
casualties of this move), removed the now-empty `mobile-M5/` wrapper.
Verified: `npm install && npx tsc --noEmit` clean at the new, correct
`mobile/` path post-move — this is a straight file relocation, no source
changes, so a clean typecheck here confirms the move didn't corrupt
anything, not that the app itself changed in any way.

**Also cleaned up in the same pass:** a stray, empty root-level
`package-lock.json` (`packages: {}` — not the real backend/frontend/
mobile lockfiles, which are untouched) that had been removed once before
(commit `1ce2601`) and crept back in since. Removed again and added
`/package-lock.json` to the root `.gitignore` — anchored to the repo
root specifically so it doesn't accidentally ignore the three real,
needed lockfiles in `backend/`, `frontend/`, and `mobile/`.
