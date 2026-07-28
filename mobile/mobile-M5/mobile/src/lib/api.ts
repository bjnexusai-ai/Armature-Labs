import { API_BASE_URL, ENDPOINTS } from '../constants/endpoints';
import { secureStorage } from './secureStorage';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Shared error-to-display-text mapping for write actions (POST/PUT), as
 * opposed to useApi.ts's messageFor which is tuned for reads. 409 gets its
 * own message since a "someone else already responded" conflict is a real,
 * expected outcome for approve/request-changes (loadAndAuthorizeApproval's
 * row lock + status check on the backend), not a generic failure.
 */
export function mutationErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409) return err.message || 'This was already responded to.';
    if (err.status === 403) return "You don't have permission to do this.";
    if (err.status === 404) return 'Not found — it may have been removed.';
    if (err.status >= 500) return 'Something went wrong on our end. Please try again.';
    return err.message || 'Something went wrong.';
  }
  return 'Could not connect. Check your connection and try again.';
}

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  // Coalesce concurrent 401s into a single refresh call.
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = await secureStorage.getItem(secureStorage.KEYS.refreshToken);
    if (!refreshToken) return null;

    try {
      const res = await fetch(`${API_BASE_URL}${ENDPOINTS.auth.refresh}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        await secureStorage.clearSession();
        return null;
      }
      // Confirmed against auth.controller.js refresh(): response is only
      // { accessToken, refreshToken } — no expiry field. The backend
      // rotates the refresh token on every call (old jti marked 'rotated',
      // new row inserted with a fresh expiry) — the new token MUST replace
      // the stored one or the next refresh will look like reuse/theft and
      // revoke the whole session (see the backend's own reuse-detection
      // logic). We don't get told the new expiry, so we leave the stored
      // refreshTokenExpiresAtMs as-is; it was already a conservative
      // estimate from login and rotation only extends real server-side
      // validity, never shortens it.
      const data = await res.json();
      await secureStorage.setItem(secureStorage.KEYS.accessToken, data.accessToken);
      await secureStorage.setItem(secureStorage.KEYS.refreshToken, data.refreshToken);
      return data.accessToken as string;
    } catch {
      return null;
    }
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Skip attaching the access token — only the login/mfa endpoints need this. */
  skipAuth?: boolean;
}

/**
 * Shared fetch client. Every screen/query hook should go through this
 * rather than calling fetch directly, so token attachment + the single
 * refresh-on-401 retry stay in one place.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, skipAuth, headers, ...rest } = options;

  const doFetch = async (): Promise<Response> => {
    const finalHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(headers as Record<string, string> | undefined),
    };
    if (!skipAuth) {
      const token = await secureStorage.getItem(secureStorage.KEYS.accessToken);
      if (token) finalHeaders.Authorization = `Bearer ${token}`;
    }
    return fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  let res = await doFetch();

  if (res.status === 401 && !skipAuth) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await doFetch();
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // Confirmed against middleware/errorHandler.js: every error response is
    // JSON `{ error: string, details?: [...] }`, never plain text. Parse it
    // so callers get the real message ("This approval has already been
    // responded to...") instead of the raw JSON blob.
    let message = text || res.statusText;
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed.error === 'string') message = parsed.error;
    } catch {
      // Not JSON (e.g. a non-Express error, proxy timeout page) — fall back
      // to the raw text/statusText already assigned above.
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
