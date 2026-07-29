import * as SecureStore from 'expo-secure-store';

/**
 * Thin wrapper over expo-secure-store (Keychain on iOS, Keystore-backed
 * EncryptedSharedPreferences on Android). Never store tokens in
 * AsyncStorage or any plain-text location; this is the only sanctioned
 * place for them.
 */
const KEYS = {
  accessToken: 'al_access_token',
  refreshToken: 'al_refresh_token',
  // Backend returns refreshExpiresIn as a number of seconds from login,
  // not an absolute timestamp — we convert to an absolute ms-epoch string
  // at write time so we don't need to remember "seconds since when".
  refreshTokenExpiresAtMs: 'al_refresh_token_expires_at_ms',
  userProfile: 'al_user_profile',
  deviceLockEnabled: 'al_device_lock_enabled',
  // M5: the registered Expo push token, so logout (and clearSession's
  // other callers) can tell the backend to forget it. Not a credential —
  // stored here anyway for consistency, no AsyncStorage dependency exists
  // in this project to put it in instead.
  devicePushToken: 'al_device_push_token',
} as const;

async function setItem(key: string, value: string) {
  await SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

async function getItem(key: string) {
  return SecureStore.getItemAsync(key);
}

async function deleteItem(key: string) {
  await SecureStore.deleteItemAsync(key);
}

export const secureStorage = {
  KEYS,
  setItem,
  getItem,
  deleteItem,

  async clearSession() {
    // Local cleanup only — does NOT call the backend to remove the push
    // token registration. clearSession() runs from several places (cold-
    // start invalid session, api.ts's forced logout after a failed
    // refresh) where firing a network call isn't appropriate or reliable.
    // The one place that also revokes the token server-side is the
    // explicit logout() flow in AuthContext.tsx (see lib/push.ts's
    // removeDevicePushToken()), same reasoning B10 used for revoke-on-
    // logout vs. just clearing local tokens.
    await Promise.all([
      deleteItem(KEYS.accessToken),
      deleteItem(KEYS.refreshToken),
      deleteItem(KEYS.refreshTokenExpiresAtMs),
      deleteItem(KEYS.userProfile),
      deleteItem(KEYS.devicePushToken),
    ]);
  },
};
