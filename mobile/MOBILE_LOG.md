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
## Addendum — post-M1 session decisions (2026-07-27)
- **MFA (B11) confirmed out of client scope** — §9.3 never asked for it;
  it was only a self-imposed "enterprise-grade gap closure" item from the
  plan doc's gap-check. Decision: skip/defer, do not build B11 unless the
  client explicitly requests it. `mfa.tsx` stays in the codebase but is
  inert — `mfaRequired` will never come back `true` from the backend, so
  the screen is unreachable in practice, not a bug.
- **B10 confirmed partial on `main`** (commit `afd3558`): refresh-token
  revocation, rotation, rate limiting are live. `device_push_tokens`
  table is NOT part of that package — still needs to land before M3
  (push registration depends on it).
