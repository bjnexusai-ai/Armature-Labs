import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';

/**
 * M5 — screenshot / screen-recording / app-switcher protection for screens
 * showing patient photos.
 *
 * The M5 brief's own premise — "iOS can only detect, not prevent" — turned
 * out to be wrong for THIS library, confirmed by reading the actual
 * installed package (`node_modules/expo-screen-capture@57.0.1`, both
 * `ios/ScreenCaptureModule.swift` and `android/.../ScreenCaptureModule.kt`),
 * not assumed from general iOS knowledge. Corrected here rather than built
 * to the wrong ceiling:
 *
 * ANDROID — real prevention. `preventScreenCaptureAsync` sets
 * `WindowManager.LayoutParams.FLAG_SECURE` on the activity window. The OS
 * itself refuses to include that window's content in a screenshot, a
 * screen recording, or an app-switcher/recents thumbnail — all three, for
 * free, from one call. This is unambiguous, OS-enforced prevention.
 *
 * IOS — also real prevention, not just detection, but via a different
 * mechanism than Android's and worth understanding precisely:
 *   - `preventScreenCaptureAsync` swaps the key window's layer underneath a
 *     `UITextField` with `isSecureTextEntry = true`. iOS never lets a
 *     secure text field's content appear in a screenshot or recording —
 *     that's a long-standing OS rule for password fields — and this
 *     library exploits that rule for the whole window, not just a text
 *     field. The practical effect: a screenshot taken while this is active
 *     comes out black for the entire window, not just the photo. This uses
 *     only public UIKit/CALayer APIs (no private API risk for App Store
 *     review), but it is a load-bearing OS quirk, not an Apple-documented
 *     "block screenshots" API — Apple genuinely offers no such official
 *     API. Verify on a real device before shipping (see Acceptance note
 *     in MOBILE_LOG.md's M5 entry); this sandbox cannot run iOS natively.
 *   - Separately, `UIScreen.main.isCaptured` (screen mirroring / recording)
 *     is handled by overlaying an opaque black view for as long as
 *     mirroring is detected — real prevention for that case too, distinct
 *     from the textfield trick.
 *   - `enableAppSwitcherProtectionAsync` (iOS-only — confirmed absent from
 *     the Android native module entirely, calling it there throws) adds a
 *     blur overlay while the app is backgrounded/in the switcher. Android
 *     doesn't need the equivalent call: FLAG_SECURE already blanks the
 *     recents thumbnail as part of the same `preventScreenCaptureAsync`
 *     call (confirmed in the package's own README, not assumed).
 *   - `addScreenshotListener` still fires on iOS even though the resulting
 *     image is black — useful as an audit/analytics signal ("someone tried
 *     to screenshot this screen"), not as the primary defense. Used below
 *     for that purpose only.
 *
 * Net correction to the plan doc and M5 brief: neither platform is
 * "detect-only." Both genuinely prevent, via different OS-level mechanisms,
 * with different side effects (Android: precise, official flag, no visual
 * artifact. iOS: effective but blanks the whole window, and is a durable-
 * but-unofficial technique). Copy anywhere in the app describing this
 * should say "protected" for both, not "iOS can only warn you" — but see
 * MOBILE_LOG.md for why device verification still matters before
 * shipping this claim.
 *
 * Reference-counted by key (library's own `activeTags` Set) — using a
 * distinct key per screen means one screen unmounting doesn't turn off
 * protection while another protected screen (e.g. the approval modal open
 * on top of case detail) is still up. Do not reuse a key across two call
 * sites unless they should share exactly one on/off lifecycle.
 */

export interface ScreenshotAttemptLogEntry {
  screenKey: string;
  at: string;
}

// In-memory, session-scoped — same pattern as `casePhotoQueue.ts` (M3).
// No backend endpoint exists to send this to; it exists so a future
// session (or a support/security review) has something to inspect via a
// debug screen, not to silently vanish the signal entirely.
const screenshotAttemptLog: ScreenshotAttemptLogEntry[] = [];

export function getScreenshotAttemptLog(): ScreenshotAttemptLogEntry[] {
  return screenshotAttemptLog;
}

/**
 * Mount this in any screen or modal that shows a patient photo. Protection
 * is active for exactly as long as the component is mounted AND `enabled`
 * is true — pass `enabled` for components like `ApprovalActionModal` that
 * stay mounted the whole time their parent screen is (visibility driven by
 * a prop, not by mount/unmount), so protection only engages while a photo
 * is actually on screen. Case detail mounts this for the whole screen (Rx
 * instructions and notes end up inside the same protected window too,
 * since Android/iOS both protect at the window level, not per-view; there
 * is no partial-screen version of either mechanism).
 */
export function usePatientPhotoScreenProtection(screenKey: string, enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;

    ScreenCapture.preventScreenCaptureAsync(screenKey).catch((err) => {
      // Unavailable on old iOS (<11) or web — fails soft, matching the
      // pattern used throughout this project for optional platform APIs
      // (see push.ts's EAS-projectId check).
      // eslint-disable-next-line no-console
      console.warn(`[screenProtection] preventScreenCaptureAsync unavailable for ${screenKey}:`, err);
    });

    if (Platform.OS === 'ios') {
      // iOS-only — confirmed absent from the Android native module, would
      // throw UnavailabilityError there.
      ScreenCapture.enableAppSwitcherProtectionAsync(0.6).catch(() => {});
    }

    const subscription = ScreenCapture.addScreenshotListener(() => {
      if (cancelled) return;
      screenshotAttemptLog.push({ screenKey, at: new Date().toISOString() });
    });

    return () => {
      cancelled = true;
      subscription.remove();
      ScreenCapture.allowScreenCaptureAsync(screenKey).catch(() => {});
      if (Platform.OS === 'ios') {
        ScreenCapture.disableAppSwitcherProtectionAsync().catch(() => {});
      }
    };
  }, [screenKey, enabled]);
}
