import { API_BASE_URL, ENDPOINTS } from '../constants/endpoints';
import { secureStorage } from './secureStorage';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
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
      const data = await res.json();
      await secureStorage.setItem(secureStorage.KEYS.accessToken, data.accessToken);
      if (data.refreshToken) {
        await secureStorage.setItem(secureStorage.KEYS.refreshToken, data.refreshToken);
      }
      if (data.refreshTokenExpiresAt) {
        await secureStorage.setItem(
          secureStorage.KEYS.refreshTokenExpiresAt,
          data.refreshTokenExpiresAt
        );
      }
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
    throw new ApiError(res.status, text || res.statusText);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
