/**
 * API endpoint paths — confirmed against the live backend
 * (backend/src/routes/*.routes.js on github.com/bjnexusai-ai/Armature-Labs,
 * main), not assumed. Where a route doesn't exist, it's not listed here —
 * see MOBILE_LOG.md M2 entry for the one real gap this caused (no
 * case-media-list endpoint; media is read via approvals instead).
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.armaturelabs.example.com';

export const ENDPOINTS = {
  auth: {
    login: '/api/auth/login', // confirmed — authRateLimiter applied (B10, landed)
    refresh: '/api/auth/refresh', // confirmed
    logout: '/api/auth/logout', // confirmed
    logoutAll: '/api/auth/logout-all', // confirmed, requireAuth
    me: '/api/auth/me', // confirmed, requireAuth — not yet used by mobile, available for session validation
    // MFA — still B11, unconfirmed. No mfa.* routes exist on the backend as of
    // this check. Left out entirely rather than guessing paths that don't exist.
  },
  // M5: closed. Real migration + controller + route written this session
  // (see backend-patch/ in the M5 delivery) — matches this exact path,
  // POST to register, DELETE to remove. NOT YET applied to the live
  // backend as of this mobile session (no push access to the repo) — see
  // MOBILE_LOG.md M5 entry for what that means for submitDevicePushToken.
  devicePushTokens: '/api/device-push-tokens',
  cases: '/api/cases',
  caseDetail: (caseId: string | number) => `/api/cases/${caseId}`,
  caseNotes: (caseId: string | number) => `/api/cases/${caseId}/notes`,
  // No GET /api/cases/:id/media route exists. uploadCaseMedia (POST) is
  // requireInternal (lab staff only) — a dentist_client can never call it.
  // Confirmed real read path for case media, scoped to a case:
  approvals: (caseId?: string | number) =>
    caseId ? `/api/approvals?caseId=${caseId}` : '/api/approvals',
  // Approvals tab (M4): no caseId filter, but listApprovals defaults to
  // limit=25/page=1 (confirmed real default in the zod schema). Rather
  // than build full pagination UI for v1, ask for the max allowed
  // (limit=100, also zod-enforced — confirmed as the real ceiling) so a
  // practice with more than 25 open approvals doesn't silently lose items
  // off the bottom of the list.
  approvalsList: '/api/approvals?limit=100',
  approvalApprove: (approvalId: string | number) => `/api/approvals/${approvalId}/approve`,
  approvalRequestChanges: (approvalId: string | number) =>
    `/api/approvals/${approvalId}/request-changes`,
  // Re-confirmed for M4 against backend/src/app.js on `main`:
  // `app.use('/api/billing', billingRoutes)` — invoices are mounted under
  // /api/billing, not top-level /api/invoices as M2/M3 had guessed. Read
  // access (list + detail) goes through `requireInvoiceReadAccess`, which
  // for a dentist_client resolves to `requirePortalPermission('can_view_invoices')`
  // (billing.routes.js). Checkout-session creation is gated the same way
  // but is out of scope for M4 (see MOBILE_LOG.md M4 entry).
  invoices: '/api/billing/invoices',
  invoiceDetail: (invoiceId: string | number) => `/api/billing/invoices/${invoiceId}`,
  // Confirmed real (stripe.routes.js), but not called anywhere in M4 —
  // Stripe Checkout UI is an open client decision, defaulted to out of
  // scope this session. Left here, unused, so it's not re-guessed later.
  invoiceCheckoutSession: (invoiceId: string | number) =>
    `/api/billing/invoices/${invoiceId}/checkout-session`,
} as const;
