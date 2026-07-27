/**
 * API endpoint paths. Everything under CASES/APPROVALS/INVOICES already
 * exists on the backend and is called exactly as the web portal calls it
 * (plan §2). AUTH additions (refresh revoke, device_push_tokens) ship in
 * B10; MFA additions ship in B11. Both are marked NEW/B10/B11 below so
 * it's obvious what to double check once those sessions land — nothing
 * here is guessed at random, it follows the plan doc's own naming
 * (`refresh_tokens`, `device_push_tokens`, MFA enrollment/verify/recovery).
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.armaturelabs.example.com';

export const ENDPOINTS = {
  auth: {
    login: '/api/auth/login', // existing — B10 adds rate limiting here, no contract change
    refresh: '/api/auth/refresh', // existing, per plan: confirm expiry now included in response
    logout: '/api/auth/logout', // B10: now also revokes the refresh token
    mfaVerify: '/api/auth/mfa/verify', // B11 — path assumed, confirm against B11 delivery
    mfaEnroll: '/api/auth/mfa/enroll', // B11 — path assumed, confirm against B11 delivery
    mfaRecovery: '/api/auth/mfa/recovery', // B11 — path assumed, confirm against B11 delivery
  },
  devicePushTokens: '/api/device-push-tokens', // B10, new table+endpoint
  cases: '/api/cases',
  caseDetail: (caseId: string) => `/api/cases/${caseId}`,
  caseMedia: (caseId: string) => `/api/cases/${caseId}/media`,
  caseNotes: (caseId: string) => `/api/cases/${caseId}/notes`,
  approvals: (caseId: string) => `/api/cases/${caseId}/approval`,
  invoices: '/api/invoices',
  invoiceDetail: (invoiceId: string) => `/api/invoices/${invoiceId}`,
} as const;
