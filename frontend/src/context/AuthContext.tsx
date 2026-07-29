import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { apiFetch, ApiError, logoutRequest } from '../lib/api';
import type { AuthUser, LoginResponse } from '../lib/authTypes';

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredUser(): AuthUser | null {
  const raw = sessionStorage.getItem('currentUser');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(readStoredUser);

  const login = useCallback(async (email: string, password: string) => {
    // Frontend Session 9 §2 decision (resolved here, not re-punted): stays
    // on sessionStorage rather than moving to httpOnly cookies. Reasoning,
    // recorded in full in FRONTEND_LOG.md's Session 9 entry: this session's
    // §1 work gives sessionStorage real server-side revocation for the
    // first time (logout actually revokes now, refresh rotation +
    // reuse-detection already existed via B10) — that closes the worst
    // practical gap (a stolen token being unrevocable for up to 7 days).
    // httpOnly cookies would meaningfully reduce the XSS exposure window
    // further, but require backend changes together (cookie-setting on
    // login/refresh/logout, CSRF protection, SameSite policy, CORS
    // credentials:true) that are cross-stack, not a frontend-only change
    // this session can finish alone. Recorded as a named follow-up, not a
    // silent re-punt.
    const data = await apiFetch<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    sessionStorage.setItem('accessToken', data.accessToken);
    sessionStorage.setItem('refreshToken', data.refreshToken);
    sessionStorage.setItem('currentUser', JSON.stringify(data.user));
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    // Frontend Session 9 §1.2 — logout() is now async and actually revokes
    // the refresh token server-side (confirmed against auth.controller.js:
    // POST /api/auth/logout takes { refreshToken } in the body, 204 on
    // success). Previously this only cleared local storage — a token
    // grabbed before logout kept working for up to 7 days regardless of
    // the user clicking "log out." If the revocation call fails (network
    // down, token already expired/already revoked), still clear local
    // storage and log the user out client-side — a failed revocation call
    // must never trap someone in a logged-in UI.
    const storedRefreshToken = sessionStorage.getItem('refreshToken');
    try {
      if (storedRefreshToken) {
        await logoutRequest(storedRefreshToken);
      }
    } catch {
      // Best-effort — see comment above. Local logout proceeds regardless.
    } finally {
      sessionStorage.removeItem('accessToken');
      sessionStorage.removeItem('refreshToken');
      sessionStorage.removeItem('currentUser');
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, isAuthenticated: !!user, login, logout }),
    [user, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { ApiError };
