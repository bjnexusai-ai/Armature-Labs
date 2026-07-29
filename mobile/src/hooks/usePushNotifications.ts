import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';

import { registerForPushNotificationsAsync, submitDevicePushToken } from '../lib/push';

/**
 * Payload shape read here (`data.caseId`) is inferred from the trigger
 * side, not confirmed against an actual delivered push: backend/src/
 * services/notifications.js's `notify()` is itself fully stubbed (no
 * email/SMS/push provider wired up — logs and returns, per its own
 * header comment), so there is no real push payload to check yet. What
 * IS confirmed is every caller of `notify()` that a dentist_client would
 * ever receive (`approval_requested` in cases.controller.js,
 * `lab_note_created` in notes.controller.js) passes `payload.caseId`
 * consistently. Deep-linking on `data.caseId` follows that real,
 * consistent field name rather than inventing a push-specific shape.
 * Re-check this once B10/a real push provider actually sends something.
 */
function extractCaseId(data: Record<string, unknown> | undefined): string | null {
  const caseId = data?.caseId;
  if (typeof caseId === 'number') return String(caseId);
  if (typeof caseId === 'string') return caseId;
  return null;
}

/**
 * Call once, from a screen only mounted while signedIn (see
 * app/(app)/_layout.tsx). Registers for push (permission + token; the
 * token *submission* to the backend is a stub — see lib/push.ts) and
 * wires up foreground/background/cold-start notification handling.
 */
export function usePushNotifications() {
  const router = useRouter();
  const hasRegistered = useRef(false);

  useEffect(() => {
    if (hasRegistered.current) return;
    hasRegistered.current = true;

    (async () => {
      const result = await registerForPushNotificationsAsync();
      if (result.status === 'registered') {
        await submitDevicePushToken(result.token);
      } else {
        // eslint-disable-next-line no-console
        console.log(`[push] registration unavailable: ${result.reason}`);
      }
    })();
  }, []);

  const goToCase = (data: Record<string, unknown> | undefined) => {
    const caseId = extractCaseId(data);
    if (caseId) {
      router.push({ pathname: '/(app)/cases/[id]', params: { id: caseId } });
    }
  };

  useEffect(() => {
    // Tap while backgrounded or foregrounded.
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      goToCase(response.notification.request.content.data as Record<string, unknown> | undefined);
    });

    // Received while the app is in the foreground — no navigation, the
    // handler in lib/push.ts already decides whether to show it.
    const receivedSub = Notifications.addNotificationReceivedListener(() => {});

    // Cold start: app was launched by tapping a notification.
    const last = Notifications.getLastNotificationResponse();
    if (last) {
      goToCase(last.notification.request.content.data as Record<string, unknown> | undefined);
    }

    return () => {
      responseSub.remove();
      receivedSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
