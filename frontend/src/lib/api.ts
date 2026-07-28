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

/**
 * Thin fetch wrapper: attaches the bearer token when present, parses JSON,
 * and throws ApiError on non-2xx so callers can branch on `.status` (401 vs
 * 403 vs other) the way the Frontend Wiring Prompt's error-handling spec
 * requires, instead of every call site re-implementing res.ok checks.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
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

// Manual mark-paid only this session — real Stripe/ACH is backend Session 8,
// per billing.controller.js's own comment. Don't build a "Pay Now" click
// handler; this records a payment someone already collected offline.
export function recordPayment(
  invoiceId: string | number,
  payload: RecordPaymentPayload
): Promise<RecordPaymentResponse> {
  return apiFetch<RecordPaymentResponse>(`/api/billing/invoices/${invoiceId}/payments`, {
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
