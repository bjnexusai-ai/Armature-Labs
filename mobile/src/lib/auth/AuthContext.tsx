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
import { secureStorage } from '../secureStorage';
import type { AuthState, LoginResponse, MfaVerifyResponse, UserProfile } from './types';

interface AuthContextValue {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  verifyMfa: (code: string) => Promise<void>;
  unlockDevice: () => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Background re-lock window. Not from the plan doc (no number was given
 * for device-lock timeout, only for refresh-token idle timeout — open
 * item §6.1, proposed 7 days, still needs client confirmation). This is a
 * reasonable interim default for M1 so the gate is testable; surface it
 * as a settings toggle later rather than a hardcoded constant if the
 * client wants it configurable.
 */
const RELOCK_AFTER_BACKGROUND_MS = 60_000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [mfaEmail, setMfaEmail] = useState<string>('');
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

  // Bootstrap on cold start: restore session from secure storage if present.
  useEffect(() => {
    (async () => {
      const [accessToken, profileJson] = await Promise.all([
        secureStorage.getItem(secureStorage.KEYS.accessToken),
        secureStorage.getItem(secureStorage.KEYS.userProfile),
      ]);
      if (!accessToken || !profileJson) {
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

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiRequest<LoginResponse>(ENDPOINTS.auth.login, {
      method: 'POST',
      skipAuth: true,
      body: { email, password },
    });

    if (res.mfaRequired) {
      if (!res.mfaChallengeToken) {
        throw new Error('Server indicated MFA is required but sent no challenge token.');
      }
      setMfaEmail(email);
      setState({
        status: 'mfaPending',
        mfaChallengeToken: res.mfaChallengeToken,
        email,
      });
      return;
    }

    if (!res.accessToken || !res.refreshToken || !res.user) {
      throw new Error('Login response missing tokens or user profile.');
    }

    await secureStorage.setItem(secureStorage.KEYS.accessToken, res.accessToken);
    await secureStorage.setItem(secureStorage.KEYS.refreshToken, res.refreshToken);
    if (res.refreshTokenExpiresAt) {
      await secureStorage.setItem(
        secureStorage.KEYS.refreshTokenExpiresAt,
        res.refreshTokenExpiresAt
      );
    }
    await secureStorage.setItem(secureStorage.KEYS.userProfile, JSON.stringify(res.user));
    await finishSignIn(res.user);
  }, [finishSignIn]);

  const verifyMfa = useCallback(
    async (code: string) => {
      if (state.status !== 'mfaPending') {
        throw new Error('No MFA challenge in progress.');
      }
      const res = await apiRequest<MfaVerifyResponse>(ENDPOINTS.auth.mfaVerify, {
        method: 'POST',
        skipAuth: true,
        body: { code, challengeToken: state.mfaChallengeToken, email: mfaEmail },
      });

      await secureStorage.setItem(secureStorage.KEYS.accessToken, res.accessToken);
      await secureStorage.setItem(secureStorage.KEYS.refreshToken, res.refreshToken);
      await secureStorage.setItem(
        secureStorage.KEYS.refreshTokenExpiresAt,
        res.refreshTokenExpiresAt
      );
      await secureStorage.setItem(secureStorage.KEYS.userProfile, JSON.stringify(res.user));
      await finishSignIn(res.user);
    },
    [state, mfaEmail, finishSignIn]
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
      // B10: logout now also revokes the refresh token server-side.
      await apiRequest(ENDPOINTS.auth.logout, { method: 'POST' });
    } catch (err) {
      // Best-effort — a failed revoke call shouldn't trap the user signed in
      // locally. Log for now; wire to real telemetry once it exists.
      if (!(err instanceof ApiError)) {
        console.warn('Logout revoke call failed:', err);
      }
    }
    await secureStorage.clearSession();
    setState({ status: 'signedOut' });
  }, []);

  const value = useMemo(
    () => ({ state, login, verifyMfa, unlockDevice, logout }),
    [state, login, verifyMfa, unlockDevice, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
