import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { ENDPOINTS } from '../constants/endpoints';
import { apiRequest } from './api';
import { secureStorage } from './secureStorage';

/**
 * Foreground presentation behavior. Field names (`shouldShowBanner`,
 * `shouldShowList`) confirmed against the installed expo-notifications@57
 * type definitions — the older `shouldShowAlert` field is gone in this
 * version, not used here.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type PushRegistrationResult =
  | { status: 'registered'; token: string }
  | { status: 'unavailable'; reason: string };

/**
 * Requests notification permission and retrieves an Expo push token.
 * Real gaps found and handled rather than guessed around:
 *
 *  - `getExpoPushTokenAsync` requires an EAS `projectId`. This project has
 *    not run `eas init` — app.json has no `extra.eas.projectId`. Rather
 *    than invent one, this checks for it and returns `unavailable` with a
 *    clear reason if it's missing, instead of calling the API with a
 *    guessed id (which would throw a confusing native error).
 *  - Push tokens don't work in the iOS Simulator / most Android emulators
 *    (`Device.isDevice` is false there) — handled the same way.
 */
export async function registerForPushNotificationsAsync(): Promise<PushRegistrationResult> {
  if (!Device.isDevice) {
    return { status: 'unavailable', reason: 'Push notifications require a physical device.' };
  }

  const existing = await Notifications.getPermissionsAsync();
  let finalStatus = existing.status;
  if (finalStatus !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }
  if (finalStatus !== 'granted') {
    return { status: 'unavailable', reason: 'Notification permission was not granted.' };
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    return {
      status: 'unavailable',
      reason: 'No EAS projectId configured (app.json extra.eas.projectId) — run `eas init` first.',
    };
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    return { status: 'registered', token };
  } catch (err) {
    return {
      status: 'unavailable',
      reason: err instanceof Error ? err.message : 'Could not retrieve a push token.',
    };
  }
}

/**
 * M5: real call, no longer a stub. `device_push_tokens` is closed this
 * session — see `backend-patch/` in the M5 delivery (migration + controller
 * + route, matching this exact request/response shape) and MOBILE_LOG.md's
 * M5 entry.
 *
 * Important caveat, stated plainly rather than left implicit: the backend
 * patch is delivered as files, not pushed — this repo has no write access
 * for this session (same limitation every prior session has noted for
 * mobile's own zips). Until someone applies `backend-patch/` to `main` and
 * deploys it, this call will 404 in production exactly like the old stub
 * warned it would. The code path itself is real and ready; the backend
 * dependency is not automatically satisfied by this file existing.
 *
 * Persists the token locally (`secureStorage`) purely so `removeDevicePushToken`
 * below has something to send on logout — not used to skip re-registering
 * on every app start, since a cheap idempotent upsert (see the backend
 * controller) is simpler and more correct than a client-side "did I already
 * register this" cache that could drift from server truth.
 */
export async function submitDevicePushToken(token: string): Promise<void> {
  await apiRequest(ENDPOINTS.devicePushTokens, {
    method: 'POST',
    body: { expoPushToken: token, platform: Platform.OS === 'ios' ? 'ios' : 'android' },
  });
  await secureStorage.setItem(secureStorage.KEYS.devicePushToken, token);
}

/**
 * Called from the explicit logout flow (`AuthContext.tsx`) — best-effort,
 * same pattern as `ENDPOINTS.auth.logout` itself: a failed revoke call
 * shouldn't block local sign-out. No-ops quietly if nothing was ever
 * registered (simulator, permission denied, no EAS projectId — see
 * `registerForPushNotificationsAsync` above).
 */
export async function removeDevicePushToken(): Promise<void> {
  const token = await secureStorage.getItem(secureStorage.KEYS.devicePushToken);
  if (!token) return;
  try {
    await apiRequest(ENDPOINTS.devicePushTokens, {
      method: 'DELETE',
      body: { expoPushToken: token },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('Push token revoke call failed:', err);
  }
}
