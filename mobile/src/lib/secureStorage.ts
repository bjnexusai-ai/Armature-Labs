import * as SecureStore from 'expo-secure-store';

/**
 * Thin wrapper over expo-secure-store (Keychain on iOS, Keystore-backed
 * EncryptedSharedPreferences on Android) — plan §1, M1 row: "secure token
 * storage (expo-secure-store)". Never store tokens in AsyncStorage or any
 * plain-text location; this is the only sanctioned place for them.
 */
const KEYS = {
  accessToken: 'al_access_token',
  refreshToken: 'al_refresh_token',
  refreshTokenExpiresAt: 'al_refresh_token_expires_at',
  userProfile: 'al_user_profile',
  deviceLockEnabled: 'al_device_lock_enabled',
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
    await Promise.all([
      deleteItem(KEYS.accessToken),
      deleteItem(KEYS.refreshToken),
      deleteItem(KEYS.refreshTokenExpiresAt),
      deleteItem(KEYS.userProfile),
    ]);
  },
};
