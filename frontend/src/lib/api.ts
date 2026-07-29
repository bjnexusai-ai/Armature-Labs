// Backend base URL. Dev uses the Vite proxy (see vite.config.ts) so this can
// stay empty in dev; production reads VITE_API_BASE_URL from env.
export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function getAccessToken(): string | null {
  return sessionStorage.getItem('accessToken');
}

function getRefreshToken(): string | null {
  return sessionStorage.getItem('refreshToken');
}

function clearAuthStorage(): void {
  sessionStorage.removeItem('accessToken');
  sessionStorage.removeItem('refreshToken');
  sessionStorage.removeItem('currentUser');
}

// Frontend Session 9 §1 — confirmed directly against
// backend/src/controllers/auth.controller.js and auth.routes.js before
// writing this: POST /api/auth/refresh takes { refreshToken } in the body
// (no auth header), rotates on every call (revokes the presented token,
// mints a new jti/row), and returns a NEW refreshToken as well as a new
// accessToken — both must be re-stored, not just the access token, or the
// very next refresh attempt would present an already-rotated (and thus
// rejected) token. Calls the raw endpoint directly rather than going
// through apiFetch, since apiFetch's own 401 handling below calls this
// function — routing through apiFetch here would recurse.
async function refreshAccessToken(): Promise<string> {
  const storedRefreshToken = getRefreshToken();
  if (!storedRefreshToken) {
    throw new ApiError(401, 'No active session.');
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: storedRefreshToken }),
    });
  } catch {
    throw new ApiError(0, 'Could not reach the server.');
  }

  if (!res.ok) {
    throw new ApiError(res.status, 'Session expired.');
  }

  const data = (await res.json()) as { accessToken: string; refreshToken: string };
  sessionStorage.setItem('accessToken', data.accessToken);
  sessionStorage.setItem('refreshToken', data.refreshToken);
  return data.accessToken;
}

// Paths that must never trigger a refresh-and-retry on a 401 of their own —
// refresh 401ing means the session is actually dead (retrying would loop),
// and login 401ing is just "wrong password", nothing to refresh.
const NO_REFRESH_PATHS = ['/api/auth/login', '/api/auth/refresh', '/api/auth/logout'];

// Dedupe concurrent 401s: if three requests fail at once on an expired
// token, they should share one /refresh call and one token rotation, not
// each independently rotate the token out from under each other (the
// backend's reuse-detection in refresh() would treat the 2nd/3rd caller's
// now-stale refreshToken as theft and revoke the whole session).
let refreshPromise: Promise<string> | null = null;

function redirectToLogin(): void {
  clearAuthStorage();
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

/**
 * Thin fetch wrapper: attaches the bearer token when present, parses JSON,
 * and throws ApiError on non-2xx so callers can branch on `.status` (401 vs
 * 403 vs other) the way the Frontend Wiring Prompt's error-handling spec
 * requires, instead of every call site re-implementing res.ok checks.
 *
 * Frontend Session 9 §1: on a 401 from anything other than the auth
 * endpoints themselves, attempts one silent refresh + one retry before
 * giving up — access tokens expire in 15m (confirmed against
 * backend/.env.example's JWT_ACCESS_EXPIRES_IN) and nothing previously
 * refreshed them, so every session used to hard-fail mid-use.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
  _isRetry = false
): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(0, 'Could not reach the server. Is the backend running?');
  }

  if (res.status === 401 && !_isRetry && !NO_REFRESH_PATHS.includes(path)) {
    // If another concurrent call already refreshed while this request was
    // in flight, storage will already hold a different access token than
    // the one this request sent — just retry with it instead of triggering
    // a second, redundant /refresh call. Confirmed with a mock-server test
    // that without this check, near-simultaneous 401s (arriving just
    // outside each other's shared refreshPromise window) each fired their
    // own refresh call — functionally harmless in that test since
    // getRefreshToken() always reads the live value, but wasteful, and a
    // needless extra rotation is exactly the kind of thing the backend's
    // reuse-detection is watching for. This check removes the redundant
    // call in the common case rather than just tolerating it.
    const currentToken = getAccessToken();
    if (currentToken && currentToken !== token) {
      return apiFetch<T>(path, options, true);
    }
    try {
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }
      await refreshPromise;
      return apiFetch<T>(path, options, true);
    } catch {
      redirectToLogin();
      throw new ApiError(401, 'Your session has expired. Please log in again.');
    }
  }

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const message =
      (body && typeof body === 'object' && 'error' in body && String((body as { error: unknown }).error)) ||
      `Request failed (${res.status})`;
    throw new ApiError(res.status, message, body);
  }

  return body as T;
}

// Confirmed against auth.controller.js's logout — takes { refreshToken } in
// the body (not a header, not the access token), 204 on success. The
// controller treats an already-invalid token as a no-op 204 too, so this
// never needs its own try/catch for "already logged out" — AuthContext's
// caller wraps the whole thing instead, for the "network down" case.
export function logoutRequest(refreshToken: string): Promise<void> {
  return apiFetch<void>('/api/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
}

// Confirmed against auth.controller.js's logoutAll — requireAuth (access
// token identifies the user), no body, revokes every refresh token row for
// that user. Not wired to any UI in this session — no existing account/
// settings screen to hang a "log out everywhere" entry point off of, and
// Master Frontend Plan §2's instruction is not to invent one just to use
// this; flagged as a named follow-up in FRONTEND_LOG.md instead. Exported
// so that follow-up doesn't have to re-confirm the endpoint shape.
export function logoutAllRequest(): Promise<void> {
  return apiFetch<void>('/api/auth/logout-all', { method: 'POST' });
}

/**
 * Reads a field that may come back camelCase (confirmed shape for
 * /api/auth/login) or snake_case (unconfirmed for /api/cases as of the
 * Frontend Wiring Prompt — verify against a real response before removing
 * this). Delete this helper once every consumed endpoint's real casing is
 * confirmed and hardcode the one true key instead of guessing both.
 */
export function pick<T = unknown>(obj: Record<string, unknown>, camel: string, snake: string): T {
  return (obj[camel] ?? obj[snake]) as T;
}

// ===== Domain API functions =====
// Endpoint shapes below match the confirmed contracts documented in
// caseTypes.ts (verified against backend/src/controllers/cases.controller.js,
// practices.controller.js, reference.controller.js). These were missing
// entirely — CaseQueuePage.tsx, CaseDetailPage.tsx, and NewCaseModal.tsx
// (commit ee0208b) were built to call them, but the functions themselves
// were never added, which is the actual reason those screens could never
// have worked even once routed.
import type {
  ApprovalActionResponse,
  ApprovePayload,
  CreateCasePayload,
  CreateCaseResponse,
  CreateChecklistPayload,
  CreateChecklistResponse,
  CreateInvoicePayload,
  CreateInvoiceResponse,
  CreateNotePayload,
  CreateNoteResponse,
  CreateProgressPhotoPayload,
  CreateProgressPhotoResponse,
  CreateShipmentPayload,
  CreateShipmentResponse,
  CreateWarrantyClaimPayload,
  CreateWarrantyClaimResponse,
  GetCaseResponse,
  GetInvoiceResponse,
  ListApprovalsQuery,
  ListApprovalsResponse,
  ListCasesQuery,
  ListCasesResponse,
  ListCaseTypesResponse,
  ListChecklistsResponse,
  ListInvoicesResponse,
  ListNotesResponse,
  ListPracticesResponse,
  ListProgressPhotosResponse,
  ListShipmentsResponse,
  ListWarrantyClaimsResponse,
  RecordPaymentPayload,
  RecordPaymentResponse,
  RequestChangesPayload,
  ResolveReworkPayload,
  ResolveReworkResponse,
  ResolveWarrantyClaimPayload,
  ResolveWarrantyClaimResponse,
  UpdateShipmentStatusPayload,
  UpdateShipmentStatusResponse,
  ListMaterialCategoriesResponse,
  CreateMaterialCategoryPayload,
  CreateMaterialCategoryResponse,
  ListMaterialsQuery,
  ListMaterialsResponse,
  GetMaterialResponse,
  CreateMaterialPayload,
  CreateMaterialResponse,
  StockTransactionResponse,
  ConsumeMaterialPayload,
  AdjustMaterialPayload,
  ListStockTransactionsResponse,
  ListVendorsResponse,
  CreateVendorPayload,
  CreateVendorResponse,
  ListPurchaseOrdersResponse,
  GetPurchaseOrderResponse,
  CreatePurchaseOrderPayload,
  CreatePurchaseOrderResponse,
  UpdatePurchaseOrderStatusPayload,
  UpdatePurchaseOrderStatusResponse,
  ReceivePurchaseOrderPayload,
  ReceivePurchaseOrderResponse,
  ListPracticeContractsResponse,
  CreatePracticeContractPayload,
  CreatePracticeContractResponse,
  ListPracticeNotesResponse,
  CreatePracticeNotePayload,
  CreatePracticeNoteResponse,
  CreateCheckoutSessionResponse,
  ListManufacturersResponse,
  GetManufacturerResponse,
  CreateManufacturerPayload,
  CreateManufacturerResponse,
  UpdateManufacturerPayload,
  UpdateManufacturerResponse,
  CreateConnectOnboardingLinkResponse,
  ListPayoutsResponse,
  CreatePayoutPayload,
  CreatePayoutResponse,
  ListPatientsQuery,
  ListPatientsResponse,
  GetPatientResponse,
  CreatePatientPayload,
  CreatePatientResponse,
  UpdatePatientPayload,
  UpdatePatientResponse,
} from './caseTypes';

interface GetPracticeResponse {
  practice: import('./caseTypes').Practice;
}

// ─────────────────────────────────────────────────────────────────────────
// Session 7 Chunk 2 — saved reports. Kept in a dedicated ./reportTypes
// module rather than folded into the caseTypes.ts import block above,
// since that block is already 60+ names deep and this is an unrelated
// resource (a personal filter-preset, not case/practice domain data).
// ─────────────────────────────────────────────────────────────────────────
import type {
  ListSavedReportsResponse,
  CreateSavedReportPayload,
  CreateSavedReportResponse,
} from './reportTypes';

export function listSavedReports(): Promise<ListSavedReportsResponse> {
  return apiFetch<ListSavedReportsResponse>('/api/reports/saved-reports');
}

export function createSavedReport(payload: CreateSavedReportPayload): Promise<CreateSavedReportResponse> {
  return apiFetch<CreateSavedReportResponse>('/api/reports/saved-reports', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function deleteSavedReport(id: number): Promise<void> {
  return apiFetch<void>(`/api/reports/saved-reports/${id}`, { method: 'DELETE' });
}

export function listCases(query: ListCasesQuery = {}): Promise<ListCasesResponse> {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.practiceId != null) params.set('practiceId', String(query.practiceId));
  if (query.assignedStaffId != null) params.set('assignedStaffId', String(query.assignedStaffId));
  if (query.priority) params.set('priority', query.priority);
  if (query.page != null) params.set('page', String(query.page));
  if (query.limit != null) params.set('limit', String(query.limit));
  const qs = params.toString();
  return apiFetch<ListCasesResponse>(`/api/cases${qs ? `?${qs}` : ''}`);
}

export function getCase(id: string | number): Promise<GetCaseResponse> {
  return apiFetch<GetCaseResponse>(`/api/cases/${id}`);
}

export function createCase(payload: CreateCasePayload): Promise<CreateCaseResponse> {
  return apiFetch<CreateCaseResponse>('/api/cases', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function listPractices(): Promise<ListPracticesResponse> {
  return apiFetch<ListPracticesResponse>('/api/practices');
}

export function getPractice(id: string | number): Promise<GetPracticeResponse> {
  return apiFetch<GetPracticeResponse>(`/api/practices/${id}`);
}

export function listCaseTypes(): Promise<ListCaseTypesResponse> {
  return apiFetch<ListCaseTypesResponse>('/api/reference/case-types');
}

// Confirmed against backend/src/controllers/approvals.controller.js and
// approvals.routes.js — GET /api/approvals (list, visibility-only, not
// gated on canApprovePhotos), POST /api/approvals/:id/approve and
// POST /api/approvals/:id/request-changes (both gated server-side on
// req.user.can_approve_photos; the frontend gate below is convenience only).
export function listApprovals(query: ListApprovalsQuery = {}): Promise<ListApprovalsResponse> {
  const params = new URLSearchParams();
  if (query.caseId != null) params.set('caseId', String(query.caseId));
  if (query.practiceId != null) params.set('practiceId', String(query.practiceId));
  if (query.status) params.set('status', query.status);
  if (query.stage) params.set('stage', query.stage);
  if (query.page != null) params.set('page', String(query.page));
  if (query.limit != null) params.set('limit', String(query.limit));
  const qs = params.toString();
  return apiFetch<ListApprovalsResponse>(`/api/approvals${qs ? `?${qs}` : ''}`);
}

export function approveApproval(id: number, payload: ApprovePayload = {}): Promise<ApprovalActionResponse> {
  return apiFetch<ApprovalActionResponse>(`/api/approvals/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function requestChangesApproval(
  id: number,
  payload: RequestChangesPayload
): Promise<ApprovalActionResponse> {
  return apiFetch<ApprovalActionResponse>(`/api/approvals/${id}/request-changes`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Billing / Invoices (Frontend Session 4) — confirmed directly against
// backend/src/controllers/billing.controller.js and billing.routes.js
// before writing these. listInvoices/getInvoice branch server-side on
// req.user.role (internal vs dentist_client) — the frontend just calls the
// one endpoint either way and renders whatever comes back.
// ─────────────────────────────────────────────────────────────────────────

export function listInvoices(query: { practiceId?: number } = {}): Promise<ListInvoicesResponse> {
  const params = new URLSearchParams();
  if (query.practiceId != null) params.set('practiceId', String(query.practiceId));
  const qs = params.toString();
  return apiFetch<ListInvoicesResponse>(`/api/billing/invoices${qs ? `?${qs}` : ''}`);
}

export function getInvoice(id: string | number): Promise<GetInvoiceResponse> {
  return apiFetch<GetInvoiceResponse>(`/api/billing/invoices/${id}`);
}

export function createInvoice(payload: CreateInvoicePayload): Promise<CreateInvoiceResponse> {
  return apiFetch<CreateInvoiceResponse>('/api/billing/invoices', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// Manual mark-paid only — records a payment someone already collected
// offline (Check/Cash/Bank Transfer). Real Stripe is createCheckoutSession
// below (backend Session 8); that path sets method: 'Stripe' itself via the
// webhook, this one is unaffected by Session 8 landing.
export function recordPayment(
  invoiceId: string | number,
  payload: RecordPaymentPayload
): Promise<RecordPaymentResponse> {
  return apiFetch<RecordPaymentResponse>(`/api/billing/invoices/${invoiceId}/payments`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// Confirmed against backend/src/controllers/stripe.controller.js — mounted
// at POST /api/billing/invoices/:id/checkout-session (stripe.routes.js's
// checkoutRouter, kept under the existing /api/billing namespace rather
// than a separate top-level path — see that file's own comment). Amount is
// always derived server-side from the invoice balance; no amount is sent
// from here. Caller should redirect to the returned url.
export function createCheckoutSession(invoiceId: string | number): Promise<CreateCheckoutSessionResponse> {
  return apiFetch<CreateCheckoutSessionResponse>(`/api/billing/invoices/${invoiceId}/checkout-session`, {
    method: 'POST',
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Manufacturers + Payouts (Frontend Session 8) — confirmed directly against
// backend/src/controllers/manufacturers.controller.js,
// backend/src/controllers/payouts.controller.js, and
// backend/src/routes/manufacturers.routes.js. Entire router is
// requireManagerRole (Owner/Office Manager only) — no dentist_client or
// other internal-role access anywhere here, applied once at the router
// level in the backend so there's nothing finer-grained to branch on
// client-side.
// ─────────────────────────────────────────────────────────────────────────

export function listManufacturers(): Promise<ListManufacturersResponse> {
  return apiFetch<ListManufacturersResponse>('/api/manufacturers');
}

export function getManufacturer(id: string | number): Promise<GetManufacturerResponse> {
  return apiFetch<GetManufacturerResponse>(`/api/manufacturers/${id}`);
}

export function createManufacturer(payload: CreateManufacturerPayload): Promise<CreateManufacturerResponse> {
  return apiFetch<CreateManufacturerResponse>('/api/manufacturers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateManufacturer(
  id: string | number,
  payload: UpdateManufacturerPayload
): Promise<UpdateManufacturerResponse> {
  return apiFetch<UpdateManufacturerResponse>(`/api/manufacturers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

// Creates the manufacturer's Stripe Connect account on first call (idempotent
// after that — reuses the stored account id), then always returns a fresh
// onboarding-link URL. Caller should redirect to the returned url.
export function createConnectOnboardingLink(id: string | number): Promise<CreateConnectOnboardingLinkResponse> {
  return apiFetch<CreateConnectOnboardingLinkResponse>(`/api/manufacturers/${id}/connect-onboarding-link`, {
    method: 'POST',
  });
}

export function listPayouts(manufacturerId: string | number): Promise<ListPayoutsResponse> {
  return apiFetch<ListPayoutsResponse>(`/api/manufacturers/${manufacturerId}/payouts`);
}

// A 402 response still carries a `payout` (status Failed) in its body —
// per payouts.controller.js, this is deliberate so the failed attempt is
// visible, not just an error toast. Callers catching ApiError should check
// `err.body?.payout` and merge it into the payout list even on failure.
export function createPayout(
  manufacturerId: string | number,
  payload: CreatePayoutPayload
): Promise<CreatePayoutResponse> {
  return apiFetch<CreatePayoutResponse>(`/api/manufacturers/${manufacturerId}/payouts`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// QC (Frontend Session 4) — confirmed directly against
// backend/src/controllers/qc.controller.js and qc.routes.js. Only the three
// routes actually mounted there — checklists create/list, rework
// resolve-by-id. Entire router is requireInternal (no portal access at all).
// ─────────────────────────────────────────────────────────────────────────

export function listChecklists(): Promise<ListChecklistsResponse> {
  return apiFetch<ListChecklistsResponse>('/api/qc/checklists');
}

export function createChecklist(payload: CreateChecklistPayload): Promise<CreateChecklistResponse> {
  return apiFetch<CreateChecklistResponse>('/api/qc/checklists', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function resolveRework(
  id: number,
  payload: ResolveReworkPayload = {}
): Promise<ResolveReworkResponse> {
  return apiFetch<ResolveReworkResponse>(`/api/qc/rework/${id}/resolve`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Case Notes / Messages (Frontend Session 5) — confirmed directly against
// backend/src/controllers/notes.controller.js. Case-scoped, not
// requireInternal — a dentist_client can create/list notes for their own
// practice's cases too (tenant isolation enforces the scoping instead).
// ─────────────────────────────────────────────────────────────────────────

export function listNotes(caseId: string | number): Promise<ListNotesResponse> {
  return apiFetch<ListNotesResponse>(`/api/cases/${caseId}/notes`);
}

export function createNote(caseId: string | number, payload: CreateNotePayload): Promise<CreateNoteResponse> {
  return apiFetch<CreateNoteResponse>(`/api/cases/${caseId}/notes`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Progress Photos (Frontend Session 5) — confirmed directly against
// backend/src/controllers/progressPhotos.controller.js. requireInternal at
// the route — lab-staff only, both directions.
// ─────────────────────────────────────────────────────────────────────────

export function listProgressPhotos(caseId: string | number): Promise<ListProgressPhotosResponse> {
  return apiFetch<ListProgressPhotosResponse>(`/api/cases/${caseId}/progress-photos`);
}

export function createProgressPhoto(
  caseId: string | number,
  payload: CreateProgressPhotoPayload
): Promise<CreateProgressPhotoResponse> {
  return apiFetch<CreateProgressPhotoResponse>(`/api/cases/${caseId}/progress-photos`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Shipments (Frontend Session 5) — confirmed directly against
// backend/src/controllers/fulfillment.controller.js. Creation is
// requireInternal (case-scoped route); the status-update endpoint is
// mounted separately (not case-scoped) on fulfillment.routes.js, also
// requireInternal. Reads are tenant-scoped, not staff-only.
// ─────────────────────────────────────────────────────────────────────────

export function listShipments(caseId: string | number): Promise<ListShipmentsResponse> {
  return apiFetch<ListShipmentsResponse>(`/api/cases/${caseId}/shipments`);
}

export function createShipment(
  caseId: string | number,
  payload: CreateShipmentPayload = {}
): Promise<CreateShipmentResponse> {
  return apiFetch<CreateShipmentResponse>(`/api/cases/${caseId}/shipments`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateShipmentStatus(
  shipmentId: string | number,
  payload: UpdateShipmentStatusPayload
): Promise<UpdateShipmentStatusResponse> {
  return apiFetch<UpdateShipmentStatusResponse>(`/api/fulfillment/shipments/${shipmentId}/status`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Warranty Claims (Frontend Session 5) — confirmed directly against
// backend/src/controllers/fulfillment.controller.js. Filing is open to
// staff OR the owning dentist_client (case-scoped route, not
// requireInternal — the backend gates it to Delivered-status cases only,
// 409 otherwise). Resolving is a separate, not-case-scoped, staff-only
// endpoint.
// ─────────────────────────────────────────────────────────────────────────

export function listWarrantyClaims(caseId: string | number): Promise<ListWarrantyClaimsResponse> {
  return apiFetch<ListWarrantyClaimsResponse>(`/api/cases/${caseId}/warranty-claims`);
}

export function createWarrantyClaim(
  caseId: string | number,
  payload: CreateWarrantyClaimPayload
): Promise<CreateWarrantyClaimResponse> {
  return apiFetch<CreateWarrantyClaimResponse>(`/api/cases/${caseId}/warranty-claims`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function resolveWarrantyClaim(
  claimId: string | number,
  payload: ResolveWarrantyClaimPayload
): Promise<ResolveWarrantyClaimResponse> {
  return apiFetch<ResolveWarrantyClaimResponse>(`/api/fulfillment/warranty-claims/${claimId}/resolve`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Materials / Inventory (Frontend Session 6) — confirmed against
// backend/src/controllers/inventory.controller.js and inventory.routes.js.
// Entire router is requireAuth + requireInternal (no dentist_client
// access). Category/material creation and /adjust are requireManagerRole;
// /consume and all reads are open to any internal staff.
// ─────────────────────────────────────────────────────────────────────────

export function listMaterialCategories(): Promise<ListMaterialCategoriesResponse> {
  return apiFetch<ListMaterialCategoriesResponse>('/api/inventory/categories');
}

export function createMaterialCategory(
  payload: CreateMaterialCategoryPayload
): Promise<CreateMaterialCategoryResponse> {
  return apiFetch<CreateMaterialCategoryResponse>('/api/inventory/categories', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function listMaterials(query: ListMaterialsQuery = {}): Promise<ListMaterialsResponse> {
  const params = new URLSearchParams();
  if (query.categoryId != null) params.set('categoryId', String(query.categoryId));
  if (query.lowStock) params.set('lowStock', 'true');
  const qs = params.toString();
  return apiFetch<ListMaterialsResponse>(`/api/inventory/materials${qs ? `?${qs}` : ''}`);
}

export function getMaterial(id: string | number): Promise<GetMaterialResponse> {
  return apiFetch<GetMaterialResponse>(`/api/inventory/materials/${id}`);
}

export function createMaterial(payload: CreateMaterialPayload): Promise<CreateMaterialResponse> {
  return apiFetch<CreateMaterialResponse>('/api/inventory/materials', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// Consumption: any internal staff. Sign is applied server-side — always
// send a positive quantity here, same as consumeMaterialSchema expects.
export function consumeMaterial(
  materialId: string | number,
  payload: ConsumeMaterialPayload
): Promise<StockTransactionResponse> {
  return apiFetch<StockTransactionResponse>(`/api/inventory/materials/${materialId}/consume`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// Adjustment: Owner/Office Manager only server-side (requireManagerRole) —
// gate the UI action accordingly, same convention as canApprovePhotos etc.
// Quantity is signed here (the one exception, per adjustMaterialSchema).
export function adjustMaterial(
  materialId: string | number,
  payload: AdjustMaterialPayload
): Promise<StockTransactionResponse> {
  return apiFetch<StockTransactionResponse>(`/api/inventory/materials/${materialId}/adjust`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function listStockTransactions(materialId: string | number): Promise<ListStockTransactionsResponse> {
  return apiFetch<ListStockTransactionsResponse>(`/api/inventory/materials/${materialId}/transactions`);
}

// ─────────────────────────────────────────────────────────────────────────
// Procurement (Frontend Session 6) — confirmed against
// backend/src/controllers/procurement.controller.js and procurement.routes.js.
// Entire router is requireAuth + requireInternal + requireManagerRole on
// EVERY route, including reads — stricter than Materials above. Don't gate
// this one's reads as "any internal staff" by mistake.
// ─────────────────────────────────────────────────────────────────────────

export function listVendors(): Promise<ListVendorsResponse> {
  return apiFetch<ListVendorsResponse>('/api/procurement/vendors');
}

export function createVendor(payload: CreateVendorPayload): Promise<CreateVendorResponse> {
  return apiFetch<CreateVendorResponse>('/api/procurement/vendors', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function listPurchaseOrders(query: { vendorId?: number } = {}): Promise<ListPurchaseOrdersResponse> {
  const params = new URLSearchParams();
  if (query.vendorId != null) params.set('vendorId', String(query.vendorId));
  const qs = params.toString();
  return apiFetch<ListPurchaseOrdersResponse>(`/api/procurement/purchase-orders${qs ? `?${qs}` : ''}`);
}

export function getPurchaseOrder(id: string | number): Promise<GetPurchaseOrderResponse> {
  return apiFetch<GetPurchaseOrderResponse>(`/api/procurement/purchase-orders/${id}`);
}

export function createPurchaseOrder(payload: CreatePurchaseOrderPayload): Promise<CreatePurchaseOrderResponse> {
  return apiFetch<CreatePurchaseOrderResponse>('/api/procurement/purchase-orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// Only Draft->Ordered / ->Cancelled are legal here — see
// UpdatePurchaseOrderStatusPayload's comment. Partially Received/Received
// are never sent from this function; they only ever come back FROM
// receivePurchaseOrder below.
export function updatePurchaseOrderStatus(
  id: string | number,
  payload: UpdatePurchaseOrderStatusPayload
): Promise<UpdatePurchaseOrderStatusResponse> {
  return apiFetch<UpdatePurchaseOrderStatusResponse>(`/api/procurement/purchase-orders/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function receivePurchaseOrder(
  id: string | number,
  payload: ReceivePurchaseOrderPayload
): Promise<ReceivePurchaseOrderResponse> {
  return apiFetch<ReceivePurchaseOrderResponse>(`/api/procurement/purchase-orders/${id}/receive`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Practice CRM (Frontend Session 6) — confirmed against
// backend/src/controllers/accounts.controller.js, mounted on
// practices.routes.js (not its own router). Both requireManagerRole,
// internal-only, no visibility split on notes (unlike case notes).
// ─────────────────────────────────────────────────────────────────────────

export function listPracticeContracts(practiceId: string | number): Promise<ListPracticeContractsResponse> {
  return apiFetch<ListPracticeContractsResponse>(`/api/practices/${practiceId}/contracts`);
}

export function createPracticeContract(
  practiceId: string | number,
  payload: CreatePracticeContractPayload
): Promise<CreatePracticeContractResponse> {
  return apiFetch<CreatePracticeContractResponse>(`/api/practices/${practiceId}/contracts`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function listPracticeNotes(practiceId: string | number): Promise<ListPracticeNotesResponse> {
  return apiFetch<ListPracticeNotesResponse>(`/api/practices/${practiceId}/notes`);
}

export function createPracticeNote(
  practiceId: string | number,
  payload: CreatePracticeNotePayload
): Promise<CreatePracticeNoteResponse> {
  return apiFetch<CreatePracticeNoteResponse>(`/api/practices/${practiceId}/notes`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Patients (Frontend Session 5.5 §1) — confirmed live against a running
// backend/src/controllers/patients.controller.js + patients.routes.js,
// mounted at /api/patients. Writes (create/update) are gated server-side:
// internal staff always allowed; dentist_client requires
// can_edit_patient_info (requirePortalPermission in patients.routes.js).
// This module doesn't re-check that client-side beyond hiding the button —
// same convention as canRecordPayment/canCreate elsewhere in this file.
// ─────────────────────────────────────────────────────────────────────────

export function listPatients(query: ListPatientsQuery = {}): Promise<ListPatientsResponse> {
  const params = new URLSearchParams();
  if (query.practiceId != null) params.set('practiceId', String(query.practiceId));
  if (query.page != null) params.set('page', String(query.page));
  if (query.limit != null) params.set('limit', String(query.limit));
  const qs = params.toString();
  return apiFetch<ListPatientsResponse>(`/api/patients${qs ? `?${qs}` : ''}`);
}

export function getPatient(id: string | number): Promise<GetPatientResponse> {
  return apiFetch<GetPatientResponse>(`/api/patients/${id}`);
}

export function createPatient(payload: CreatePatientPayload): Promise<CreatePatientResponse> {
  return apiFetch<CreatePatientResponse>('/api/patients', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updatePatient(
  id: string | number,
  payload: UpdatePatientPayload
): Promise<UpdatePatientResponse> {
  return apiFetch<UpdatePatientResponse>(`/api/patients/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Session 7 Chunk 3 — equipment + technician scheduling. Confirmed against
// equipment.controller.js / planning.controller.js directly. Types kept in
// ./equipmentTypes (same reasoning as ./reportTypes in Chunk 2 — unrelated
// resource, keeps caseTypes.ts's already-large import block from growing
// further).
// ─────────────────────────────────────────────────────────────────────────
import type {
  ListEquipmentResponse,
  GetEquipmentResponse,
  CreateEquipmentPayload,
  CreateEquipmentResponse,
  UpdateEquipmentStatusPayload,
  ListMaintenanceLogsResponse,
  CreateMaintenanceLogPayload,
  CreateMaintenanceLogResponse,
  ListShiftsResponse,
  CreateShiftPayload,
  CreateShiftResponse,
  ListBookingsResponse,
  CreateBookingPayload,
  CreateBookingResponse,
} from './equipmentTypes';

export function listEquipment(status?: string): Promise<ListEquipmentResponse> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiFetch<ListEquipmentResponse>(`/api/equipment${qs}`);
}

export function getEquipmentItem(id: string | number): Promise<GetEquipmentResponse> {
  return apiFetch<GetEquipmentResponse>(`/api/equipment/${id}`);
}

export function createEquipmentItem(payload: CreateEquipmentPayload): Promise<CreateEquipmentResponse> {
  return apiFetch<CreateEquipmentResponse>('/api/equipment', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateEquipmentStatus(
  id: string | number,
  payload: UpdateEquipmentStatusPayload
): Promise<GetEquipmentResponse> {
  return apiFetch<GetEquipmentResponse>(`/api/equipment/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function listMaintenanceLogs(equipmentId: string | number): Promise<ListMaintenanceLogsResponse> {
  return apiFetch<ListMaintenanceLogsResponse>(`/api/equipment/${equipmentId}/maintenance-logs`);
}

export function createMaintenanceLog(
  equipmentId: string | number,
  payload: CreateMaintenanceLogPayload
): Promise<CreateMaintenanceLogResponse> {
  return apiFetch<CreateMaintenanceLogResponse>(`/api/equipment/${equipmentId}/maintenance-logs`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function listShifts(technicianId?: number): Promise<ListShiftsResponse> {
  const qs = technicianId != null ? `?technicianId=${technicianId}` : '';
  return apiFetch<ListShiftsResponse>(`/api/planning/shifts${qs}`);
}

export function createShift(payload: CreateShiftPayload): Promise<CreateShiftResponse> {
  return apiFetch<CreateShiftResponse>('/api/planning/shifts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function listBookings(equipmentId?: number): Promise<ListBookingsResponse> {
  const qs = equipmentId != null ? `?equipmentId=${equipmentId}` : '';
  return apiFetch<ListBookingsResponse>(`/api/planning/bookings${qs}`);
}

export function createBooking(payload: CreateBookingPayload): Promise<CreateBookingResponse> {
  return apiFetch<CreateBookingResponse>('/api/planning/bookings', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
