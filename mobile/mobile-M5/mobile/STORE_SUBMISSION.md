# Store submission prep — M5

Answered from what the app actually does (this codebase, this session) —
not boilerplate. Split into what's actually ready vs. what's blocked on
account ownership, per the M5 acceptance check.

## Blocked — cannot be completed without external account access

- **Apple Developer Program account** and **Google Play Console account**
  — ownership still unanswered (plan §6 item 4, unanswered as of the plan
  doc, M4, and now M5). Nothing below can actually be *submitted* until
  this is resolved. This session cannot create these accounts or guess at
  credentials.
- **`eas init`** — not run. Confirmed absent as of M3/M4/M5 (`app.json` has
  no `extra.eas.projectId`, no `eas.json` before this session). Running it
  for real needs a real Expo account/org — this sandbox has no such
  account and no interactive login available. `eas.json` in this delivery
  is a **template only** (build profiles + a `submit.production` block
  with placeholder fields like `REPLACE_WITH_REAL_APPLE_ID`) — do not treat
  it as a working config. After a real `eas init`, the generated
  `projectId` needs to be added to `app.json`'s `extra.eas` block (not
  present yet).
- **Apple/Google submission itself** — depends on both items above.

## Done this session

### Privacy policy
No privacy policy document exists in this repo or delivery. A dental-lab
app handling patient names, case photos, and approval/billing data needs
one before either store will accept a submission — this is a real gap,
not a formatting task, and needs legal/business input (data retention,
who patient data is disclosed to, breach notification) that isn't
answerable from the codebase alone. Flagging as open, not drafting a
placeholder that could be mistaken for a real one.

### Data Safety (Google Play) / App Privacy (Apple) — answered from real app behavior
Based on what's actually in this codebase (`package.json` dependencies,
API calls, permissions requested):

| Data type | Collected? | Notes |
|---|---|---|
| Patient photos / case images | Yes | Uploaded to the practice's own backend (this repo's `backend/`), not a third party. Case photos are PHI-adjacent. |
| Patient name / reference ID | Yes | Displayed and transmitted to the same backend; not shared elsewhere in this codebase. |
| Approval/billing records | Yes | Same backend, same scope. |
| Precise location | No | Not requested anywhere in `app.json` permissions or code. |
| Push token | Yes | Sent to Expo's push notification service (`expo-notifications`) as an intermediary to deliver notifications, and (per this session's B10-equivalent work) to this app's own backend for storage. This is the one genuine third-party data flow in the app — Expo, not an ad or analytics network. |
| Analytics / advertising SDKs | None found | No analytics, crash-reporting, or ad SDK is a dependency of this project (checked `package.json` directly this session — full list in `MOBILE_LOG.md`). |
| Camera | Requested | `expo-image-picker`'s camera permission — case photo capture (M3). |
| Photo library | Requested | `expo-image-picker`'s photo-library permission — same feature. |
| Biometrics (Face ID / fingerprint) | Used locally only | `expo-local-authentication` — device-lock gate (M1). Biometric data itself never leaves the device; the app only receives a yes/no unlock result from the OS. |

This table is accurate as of this session's dependency list — re-check it
if dependencies change before actually filling out either store's
questionnaire form.

### Age rating
No user-generated public content, no social features, no ads. Appropriate
for a professional/business-tool rating (Google Play: likely "Rated for
3+" business-app category; Apple: 4+). This isn't a consumer app in
either store's content-sensitive sense — flagging the likely answer, not
filling out the actual form (that happens inside each console).

### Screenshots
Not generated this session — needs a running simulator/device to capture
real screens, which this sandbox doesn't have (same limitation noted for
every prior mobile session's "as real as the sandbox allows" caveat).
Once a build is running on a simulator, capture: login, case list, case
detail (with the M5 protected-photo view), approvals tab, invoice detail.

### Build artifacts
`npx tsc --noEmit` and `npx expo-doctor` both run clean this session (see
`MOBILE_LOG.md`) — the app is in a buildable state. No `.ipa`/`.aab` was
produced (that requires `eas build`, which needs the blocked `eas init`
step above, or a local Xcode/Android Studio build this sandbox can't run).
