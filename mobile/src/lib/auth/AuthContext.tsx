import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';

import { ENDPOINTS } from '../../constants/endpoints';
import { apiRequest, ApiError } from '../api';
import { isDeviceLockAvailable, promptDeviceUnlock } from '../biometrics';
import { removeDevicePushToken } from '../push';
import { secureStorage } from '../secureStorage';
import type { AuthState, LoginResponse, UserProfile } from './types';

interface AuthContextValue {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  unlockDevice: () => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Background re-lock window. Not specified anywhere in the plan or the
 * backend (device-lock timing is a mobile-only UX decision, no server
 * concept). Interim default so the gate is testable; make it a real
 * setting later if the client wants it configurable.
 */
const RELOCK_AFTER_BACKGROUND_MS = 60_000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const backgroundedAtRef = React.useRef<number | null>(null);

  const finishSignIn = useCallback(async (user: UserProfile) => {
    const deviceLockAvailable = await isDeviceLockAvailable();
    const deviceLockEnabled = await secureStorage.getItem(
      secureStorage.KEYS.deviceLockEnabled
    );
    if (deviceLockAvailable && deviceLockEnabled !== 'false') {
      setState({ status: 'deviceLockPending', user });
    } else {
      setState({ status: 'signedIn', user });
    }
  }, []);

  // Bootstrap on cold start: restore session from secure storage if present
  // and the refresh token hasn't already expired.
  useEffect(() => {
    (async () => {
      const [accessToken, profileJson, expiresAtMs] = await Promise.all([
        secureStorage.getItem(secureStorage.KEYS.accessToken),
        secureStorage.getItem(secureStorage.KEYS.userProfile),
        secureStorage.getItem(secureStorage.KEYS.refreshTokenExpiresAtMs),
      ]);
      if (!accessToken || !profileJson) {
        setState({ status: 'signedOut' });
        return;
      }
      if (expiresAtMs && Number(expiresAtMs) < Date.now()) {
        await secureStorage.clearSession();
        setState({ status: 'signedOut' });
        return;
      }
      try {
        const user = JSON.parse(profileJson) as UserProfile;
        await finishSignIn(user);
      } catch {
        await secureStorage.clearSession();
        setState({ status: 'signedOut' });
      }
    })();
  }, [finishSignIn]);

  // Re-lock the device gate after the app has been backgrounded for a while.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        backgroundedAtRef.current = Date.now();
      } else if (next === 'active') {
        const backgroundedAt = backgroundedAtRef.current;
        backgroundedAtRef.current = null;
        if (
          backgroundedAt &&
          Date.now() - backgroundedAt > RELOCK_AFTER_BACKGROUND_MS
        ) {
          setState((prev) =>
            prev.status === 'signedIn' ? { status: 'deviceLockPending', user: prev.user } : prev
          );
        }
      }
    });
    return () => sub.remove();
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      // No MFA branching — the backend has no mfa.* routes yet (B11 not
      // landed as of this check). login() always returns tokens directly.
      // Reintroduce an mfaPending branch here once B11 ships its real
      // response contract — don't guess it in the meantime.
      const res = await apiRequest<LoginResponse>(ENDPOINTS.auth.login, {
        method: 'POST',
        skipAuth: true,
        body: { email, password },
      });

      await secureStorage.setItem(secureStorage.KEYS.accessToken, res.accessToken);
      await secureStorage.setItem(secureStorage.KEYS.refreshToken, res.refreshToken);
      await secureStorage.setItem(
        secureStorage.KEYS.refreshTokenExpiresAtMs,
        String(Date.now() + res.refreshExpiresIn * 1000)
      );
      await secureStorage.setItem(secureStorage.KEYS.userProfile, JSON.stringify(res.user));
      await finishSignIn(res.user);
    },
    [finishSignIn]
  );

  const unlockDevice = useCallback(async () => {
    if (state.status !== 'deviceLockPending') return false;
    const success = await promptDeviceUnlock();
    if (success) {
      setState({ status: 'signedIn', user: state.user });
    }
    return success;
  }, [state]);

  const logout = useCallback(async () => {
    try {
      await apiRequest(ENDPOINTS.auth.logout, { method: 'POST' });
    } catch (err) {
      // Best-effort — a failed revoke call shouldn't trap the user signed in
      // locally.
      if (!(err instanceof ApiError)) {
        console.warn('Logout revoke call failed:', err);
      }
    }
    // M5: also revoke the device's push token registration on explicit
    // logout — best-effort, same reasoning as the auth revoke call above.
    // See push.ts for why this is the one clearSession() caller that also
    // hits the network for this.
    await removeDevicePushToken();
    await secureStorage.clearSession();
    setState({ status: 'signedOut' });
  }, []);

  const value = useMemo(
    () => ({ state, login, unlockDevice, logout }),
    [state, login, unlockDevice, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
