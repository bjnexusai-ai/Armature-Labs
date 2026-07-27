import * as LocalAuthentication from 'expo-local-authentication';

/**
 * Device PIN/biometric gate — plan §1, M1 row: "device PIN/biometric gate
 * (expo-local-authentication)". This is a device-level unlock layered on
 * top of the account session (gap-check finding: "No device-level lock on
 * mobile", closed in M1). It is NOT the account login/MFA — a user can be
 * signed into their account and still be asked to unlock the device gate
 * after backgrounding the app.
 */
export async function isDeviceLockAvailable(): Promise<boolean> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) return false;
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  return isEnrolled;
}

export async function promptDeviceUnlock(): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Unlock Armature Labs',
    fallbackLabel: 'Use device passcode',
    disableDeviceFallback: false,
    cancelLabel: 'Cancel',
  });
  return result.success;
}
