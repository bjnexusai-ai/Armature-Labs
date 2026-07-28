// Confirmed directly against backend/src/controllers/cases.controller.js,
// practices.controller.js, reference.controller.js, and utils/caseStatus.js.
// Case ROW fields are snake_case (the controller's CASE_SELECT_FIELDS is
// selected straight off the `cases` table with no aliasing). Response
// WRAPPER keys and request BODY keys are camelCase. This is not a guess —
// don't reintroduce a dual-fallback (`pick`) helper for this resource.

export type CasePriority = 'Standard' | 'Rush' | 'Urgent';

// The 10-status lifecycle, verbatim from backend/src/utils/caseStatus.js.
export const LINEAR_STATUSES = [
  'Case Entered',
  'In Design',
  'Pending Design Approval',
  'Processing',
  'Pending Bisque Approval',
  'Finalizing',
  'Shipped Out',
  'Delivered',
] as const;

export const EXCEPTION_STATUSES = ['Case on Hold', 'Delayed'] as const;

export const ALL_STATUSES = [...LINEAR_STATUSES, ...EXCEPTION_STATUSES] as const;

export type CaseStatus = (typeof ALL_STATUSES)[number];

export interface CaseRecord {
  id: number;
  case_number: string;
  practice_id: number;
  dentist_id: number;
  case_type_id: number;
  patient_name: string | null;
  patient_reference_id: string | null;
  rx_instructions: string | null;
  priority: CasePriority;
  // Confirmed live (Session 7 click-through) this is NOT reliably a bare
  // YYYY-MM-DD string despite the DB column being `date` — cases.controller.js
  // doesn't ::text-cast it (unlike equipment.controller.js's date columns),
  // so pg returns a JS Date and it serializes as a full ISO timestamp
  // (e.g. "2026-08-06T00:00:00.000Z"). Use parseFlexibleDate() from
  // lib/dateUtils.ts rather than assuming either shape.
  due_date: string;
  current_status: CaseStatus;
  prior_status: CaseStatus | null;
  assigned_staff_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ListCasesResponse {
  cases: CaseRecord[];
  pagination: Pagination;
}

export interface StageHistoryEntry {
  id: number;
  stage_id: number;
  stage_name: string;
  assigned_technician_id: number | null;
  started_at: string;
  completed_at: string | null;
  status: string;
  notes: string | null;
}

export interface StatusAuditEntry {
  id: number;
  changed_by: number;
  changed_by_name: string;
  old_status: CaseStatus | null;
  new_status: CaseStatus;
  remarks: string | null;
  changed_at: string;
}

export interface GetCaseResponse {
  case: CaseRecord;
  currentStage: StageHistoryEntry | null;
  recentStatusAudit: StatusAuditEntry[];
}

// Request body for POST /api/cases — camelCase, .strict() on the backend so
// no extra keys (case_number / currentStatus etc.) are ever sent.
export interface CreateCasePayload {
  practiceId: number;
  dentistId: number;
  caseTypeId: number;
  patientName?: string;
  patientReferenceId?: string;
  rxInstructions?: string;
  priority?: CasePriority;
  dueDate: string; // YYYY-MM-DD
  notes?: string;
}

export interface CreateCaseResponse {
  case: CaseRecord;
}

// GET /api/practices — snake_case rows under a camelCase wrapper key.
export interface Practice {
  id: number;
  practice_name: string;
  address_line: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  phone: string | null;
  status: string;
  created_at?: string;
}

export interface ListPracticesResponse {
  practices: Practice[];
}

// GET /api/reference/case-types — inner fields have no snake/camel ambiguity.
export interface CaseType {
  id: number;
  name: string;
  description: string | null;
}

export interface ListCaseTypesResponse {
  caseTypes: CaseType[];
}

export interface WorkflowStage {
  id: number;
  name: string;
  sequence_order: number;
  description: string | null;
}

export interface ListWorkflowStagesResponse {
  workflowStages: WorkflowStage[];
}

export interface ListCasesQuery {
  status?: CaseStatus;
  practiceId?: number;
  assignedStaffId?: number;
  priority?: CasePriority;
  page?: number;
  limit?: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Approvals (Frontend Session 3) — confirmed directly against
// backend/src/controllers/approvals.controller.js. Row fields are
// snake_case (selected straight off `approvals`/`cases`/`case_files` with
// no aliasing, same convention as CaseRecord above) under camelCase
// wrapper keys (`approvals`, `pagination`, `approval`, `case`).
// ─────────────────────────────────────────────────────────────────────────

export type ApprovalStage = 'design' | 'bisque';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface ApprovalRecord {
  id: number;
  case_id: number;
  media_id: number;
  stage: ApprovalStage;
  status: ApprovalStatus;
  approved_by: number | null;
  comments: string | null;
  responded_at: string | null;
  created_at: string;
  case_number: string;
  practice_id: number;
  patient_name: string | null;
  case_current_status: CaseStatus;
  media_file_name: string;
  media_file_url: string;
}

export interface ListApprovalsQuery {
  caseId?: number;
  practiceId?: number; // internal-only — 400 on the portal, mirrors listCases
  status?: ApprovalStatus;
  stage?: ApprovalStage;
  page?: number;
  limit?: number;
}

export interface ListApprovalsResponse {
  approvals: ApprovalRecord[];
  pagination: Pagination;
}

// approve/request-changes return a smaller shape than the list row above —
// no case_number/patient_name/media_* join fields, just the updated
// approval + the case after its status transition. Don't assume these
// match ApprovalRecord.
export interface ApprovalActionResult {
  id: number;
  case_id: number;
  stage: ApprovalStage;
  status: ApprovalStatus;
  comments: string | null;
}

export interface ApprovalActionResponse {
  approval: ApprovalActionResult;
  case: CaseRecord;
}

export interface RequestChangesPayload {
  comments: string; // required by the backend — min length 1
}

export interface ApprovePayload {
  comments?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Billing / Invoices (Frontend Session 4) — confirmed directly against
// backend/src/controllers/billing.controller.js and billing.routes.js.
// Row fields are snake_case (selected straight off `invoices` /
// `invoice_line_items` / `payments` with no aliasing), under camelCase
// wrapper keys (`invoice`, `invoices`, `payment`), same convention as
// CaseRecord/ApprovalRecord. `dueDate`/`taxAmount`/`paidDate` are now wired
// (Session 5.5 backend fix, 2026-07-28 — confirmed live via curl and the
// backend's own integration tests, not assumed from the schema/migration
// alone): due_date/tax_amount/paid_date appear on every invoice response.
// paidDate is never client-accepted — server-set only, on the transition
// into Paid.
// ─────────────────────────────────────────────────────────────────────────

export type InvoiceStatus = 'Draft' | 'Sent' | 'Partially Paid' | 'Paid' | 'Void';

export interface InvoiceLineItem {
  id: number;
  case_id: number | null;
  description: string;
  quantity: number;
  unit_price: string; // numeric(10,2) comes back as a string from pg
  line_total: string;
}

export interface Payment {
  id: number;
  amount: string;
  method: string;
  reference_note: string | null;
  created_at: string;
}

// GET /api/billing/invoices list row — no lineItems/payments joined.
// due_date/tax_amount/paid_date confirmed live (Session 5.5 backend fix,
// 2026-07-28) — due_date/paid_date come back as full ISO datetime strings
// (`date` columns aren't ::text-cast server-side), same ambiguity as
// CaseRecord.due_date above — use parseFlexibleDate(), don't assume
// bare YYYY-MM-DD.
export interface InvoiceListRow {
  id: number;
  invoice_number: string;
  practice_id: number;
  status: InvoiceStatus;
  subtotal: string;
  amount_paid: string;
  due_date: string | null;
  tax_amount: string;
  paid_date: string | null;
  notes?: string | null; // present for internal callers, absent for portal rows
  created_at: string;
}

// GET /api/billing/invoices/:id — same row plus lineItems + payments.
export interface InvoiceDetail {
  id: number;
  invoice_number: string;
  practice_id: number;
  status: InvoiceStatus;
  subtotal: string;
  amount_paid: string;
  due_date: string | null;
  tax_amount: string;
  paid_date: string | null;
  notes: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  lineItems: InvoiceLineItem[];
  payments: Payment[];
}

export interface ListInvoicesResponse {
  invoices: InvoiceListRow[];
}

export interface GetInvoiceResponse {
  invoice: InvoiceDetail;
}

export interface CreateInvoiceLineItemInput {
  caseId?: number;
  description: string;
  quantity?: number;
  unitPrice: number;
}

export interface CreateInvoicePayload {
  practiceId: number;
  notes?: string;
  dueDate?: string; // YYYY-MM-DD, sent as typed; server stores as `date`
  taxAmount?: number; // defaults to 0 server-side if omitted
  lineItems: CreateInvoiceLineItemInput[];
}

export interface CreateInvoiceResponse {
  invoice: InvoiceDetail;
}

export interface RecordPaymentPayload {
  amount: number;
  method: string;
  referenceNote?: string;
}

export interface RecordPaymentResponse {
  payment: Payment;
  invoice: {
    id: number;
    invoice_number: string;
    practice_id: number;
    status: InvoiceStatus;
    subtotal: string;
    amount_paid: string;
    due_date: string | null;
    tax_amount: string;
    paid_date: string | null;
    updated_at: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────
// QC (Frontend Session 4) — confirmed directly against
// backend/src/controllers/qc.controller.js and qc.routes.js. This session
// only covers the three routes actually mounted on qc.routes.js
// (checklists create/list, rework resolve-by-id) — recordQcResult /
// createCaseRework / listCaseRework / final-approval are exported by the
// controller but mounted under cases.routes.js instead and are out of this
// session's scope per the resume prompt.
// ─────────────────────────────────────────────────────────────────────────

export interface QcChecklistItem {
  id: number;
  item_text: string;
  sort_order: number;
}

export interface QcChecklist {
  id: number;
  name: string;
  case_type_id: number | null;
  is_active: boolean;
  created_at: string;
  items: QcChecklistItem[];
}

export interface ListChecklistsResponse {
  checklists: QcChecklist[];
}

export interface CreateChecklistPayload {
  name: string;
  caseTypeId?: number;
  items: string[];
}

export interface CreateChecklistResponse {
  checklist: QcChecklist;
}

export interface ReworkRecord {
  id: number;
  case_id: number;
  case_qc_result_id: number | null;
  reason: string;
  requested_by: number;
  resolved_at: string | null;
  resolved_by: number | null;
  resolution_notes: string | null;
  created_at: string;
}

export interface ResolveReworkPayload {
  resolutionNotes?: string;
}

export interface ResolveReworkResponse {
  rework: ReworkRecord;
}

// ─────────────────────────────────────────────────────────────────────────
// Case Notes / Messages (Frontend Session 5) — confirmed directly against
// backend/src/controllers/notes.controller.js and the notes routes mounted
// on cases.routes.js (POST/GET /api/cases/:id/notes). Two-way: staff AND
// dentist_client may author a note — NOT requireInternal at the route,
// tenant isolation (assertPracticeAccess) is what scopes access instead.
// Row fields snake_case under a camelCase wrapper key, same convention as
// every other resource in this file.
// ─────────────────────────────────────────────────────────────────────────

export type NoteVisibility = 'internal' | 'portal';

export interface CaseNote {
  id: number;
  case_id: number;
  author_id: number;
  body: string;
  visibility: NoteVisibility;
  created_at: string;
}

export interface ListNotesResponse {
  notes: CaseNote[];
}

// visibility is accepted from staff callers only — a dentist_client's note
// is always silently forced to 'portal' server-side even if sent, per the
// controller's documented decision. Omit it entirely for a portal author
// rather than send a value the backend will just override.
export interface CreateNotePayload {
  body: string;
  visibility?: NoteVisibility;
}

export interface CreateNoteResponse {
  note: CaseNote;
}

// ─────────────────────────────────────────────────────────────────────────
// Progress Photos (Frontend Session 5) — confirmed directly against
// backend/src/controllers/progressPhotos.controller.js and the
// progress-photos routes mounted on cases.routes.js. requireInternal at the
// route — lab-staff only, both to create and to view (documented decision:
// no notification-table entry or portal permission flag covers this, so
// it's treated as an internal production-tracking aid, not a client-facing
// gallery, pending an explicit client answer).
// ─────────────────────────────────────────────────────────────────────────

export interface ProgressPhoto {
  id: number;
  case_id: number;
  uploaded_by: number;
  file_url: string;
  caption: string | null;
  taken_at: string;
  created_at: string;
}

export interface ListProgressPhotosResponse {
  progressPhotos: ProgressPhoto[];
}

export interface CreateProgressPhotoPayload {
  fileUrl: string;
  caption?: string;
  takenAt?: string; // ISO datetime, optional — defaults to now() server-side
}

export interface CreateProgressPhotoResponse {
  progressPhoto: ProgressPhoto;
}

// ─────────────────────────────────────────────────────────────────────────
// Shipments (Frontend Session 5) — confirmed directly against
// backend/src/controllers/fulfillment.controller.js. Creation
// (POST /api/cases/:id/shipments) is staff-only and explicit, never
// auto-fired off a case-status change. Reads (GET /api/cases/:id/shipments)
// are tenant-scoped, NOT staff-only — the dental office can see
// tracking/carrier info for their own case. Status updates
// (PATCH /api/fulfillment/shipments/:id/status) are a separate,
// not-case-scoped, staff-only endpoint (a case can have more than one
// shipment, e.g. a reshipment after a warranty claim).
// ─────────────────────────────────────────────────────────────────────────

export type ShipmentStatus = 'Preparing' | 'Shipped' | 'Delivered' | 'Returned';

export interface Shipment {
  id: number;
  case_id: number;
  carrier: string | null;
  tracking_number: string | null;
  status: ShipmentStatus;
  shipped_at: string | null;
  delivered_at: string | null;
  created_by: number;
  created_at: string;
}

export interface ListShipmentsResponse {
  shipments: Shipment[];
}

export interface CreateShipmentPayload {
  carrier?: string;
  trackingNumber?: string;
}

export interface CreateShipmentResponse {
  shipment: Shipment;
}

export interface UpdateShipmentStatusPayload {
  status: ShipmentStatus;
  carrier?: string;
  trackingNumber?: string;
}

export interface UpdateShipmentStatusResponse {
  shipment: Shipment;
}

// ─────────────────────────────────────────────────────────────────────────
// Warranty Claims (Frontend Session 5) — confirmed directly against
// backend/src/controllers/fulfillment.controller.js. Filing
// (POST /api/cases/:id/warranty-claims) is open to either internal staff
// or the dentist_client that owns the case (assertPracticeAccess, same
// tenant-check shape as approvals) — but ONLY against a case already in
// the terminal "Delivered" status (409 otherwise, checked server-side).
// Resolving (PATCH /api/fulfillment/warranty-claims/:id/resolve) is
// staff-only and not case-scoped.
// ─────────────────────────────────────────────────────────────────────────

export type WarrantyClaimStatus = 'Open' | 'Under Review' | 'Approved' | 'Denied' | 'Resolved';

export interface WarrantyClaim {
  id: number;
  case_id: number;
  filed_by: number;
  description: string;
  status: WarrantyClaimStatus;
  resolution_notes: string | null;
  resolved_by: number | null;
  resolved_at: string | null;
  created_at: string;
}

export interface ListWarrantyClaimsResponse {
  warrantyClaims: WarrantyClaim[];
}

export interface CreateWarrantyClaimPayload {
  description: string;
}

export interface CreateWarrantyClaimResponse {
  warrantyClaim: WarrantyClaim;
}

export interface ResolveWarrantyClaimPayload {
  status: Exclude<WarrantyClaimStatus, 'Open'>;
  resolutionNotes?: string;
}

export interface ResolveWarrantyClaimResponse {
  warrantyClaim: WarrantyClaim;
}

// ─────────────────────────────────────────────────────────────────────────
// Materials / Inventory / Procurement / Practice CRM (Frontend Session 6)
// — confirmed directly against backend/src/controllers/inventory.controller.js,
// procurement.controller.js, accounts.controller.js and their matching
// .routes.js files (re-cloned from github.com/bjnexusai-ai/Armature-Labs
// main @ 87ab027, not assumed from a prior session's notes).
//
// IMPORTANT CASING CORRECTION vs. an earlier, never-delivered attempt at
// this session: these three controllers do NOT camelCase their SQL rows
// (no humps/serializer middleware exists in app.js). Every row field below
// is the raw snake_case column name straight off RETURNING/SELECT, under a
// camelCase wrapper key — identical convention to InvoiceListRow/
// InvoiceDetail above. Input payload fields ARE camelCase (zod schemas use
// z.coerce on categoryId/unitCost/etc.). Don't "fix" the row fields to
// camelCase on a future pass without re-checking the controller first.
// ─────────────────────────────────────────────────────────────────────────

export interface MaterialCategory {
  id: number;
  name: string;
  created_at: string;
}

export type MaterialStatus = 'OK' | 'Low Stock' | string; // backend-derived column; treat unknown values as OK-styled

export interface Material {
  id: number;
  category_id: number;
  name: string;
  unit: string;
  unit_cost: string; // numeric(10,2) as string, same convention as Invoice
  reorder_threshold: string;
  current_stock: string;
  status: MaterialStatus;
  created_at: string;
  updated_at?: string;
}

export type StockTransactionType = 'Receiving' | 'Consumption' | 'Adjustment';

export interface MaterialStockTransaction {
  id: number;
  material_id: number;
  type: StockTransactionType;
  quantity: string; // signed — negative for Consumption, positive for Receiving, either sign for Adjustment
  lot_number: string;
  case_id: number | null;
  purchase_order_id: number | null;
  performed_by: number;
  notes: string | null;
  created_at: string;
}

export interface ListMaterialCategoriesResponse {
  categories: MaterialCategory[];
}

export interface CreateMaterialCategoryPayload {
  name: string;
}

export interface CreateMaterialCategoryResponse {
  category: MaterialCategory;
}

export interface ListMaterialsQuery {
  categoryId?: number;
  lowStock?: boolean;
}

export interface ListMaterialsResponse {
  materials: Material[];
}

export interface GetMaterialResponse {
  material: Material;
}

export interface CreateMaterialPayload {
  categoryId: number;
  name: string;
  unit: string;
  unitCost?: number;
  reorderThreshold?: number;
  initialStock?: number;
}

export interface CreateMaterialResponse {
  material: Material;
}

// Both consume/adjust return the same shape: the new transaction row plus
// the material row with its updated current_stock — confirmed against
// recordStockTransaction's shared return in inventory.controller.js.
export interface StockTransactionResponse {
  stockTransaction: MaterialStockTransaction;
  material: Material;
}

export interface ConsumeMaterialPayload {
  quantity: number; // always positive — sign is applied server-side
  lotNumber: string;
  caseId?: number;
  notes?: string;
}

export interface AdjustMaterialPayload {
  quantity: number; // signed — caller supplies the actual delta, can be negative
  lotNumber: string;
  notes: string; // required server-side (a reason), unlike Consumption's optional notes
}

export interface ListStockTransactionsResponse {
  stockTransactions: MaterialStockTransaction[];
}

// ─── Procurement: vendors, purchase orders ─────────────────────────────

export interface Vendor {
  id: number;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
}

export interface ListVendorsResponse {
  vendors: Vendor[];
}

export interface CreateVendorPayload {
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
}

export interface CreateVendorResponse {
  vendor: Vendor;
}

export type PurchaseOrderStatus = 'Draft' | 'Ordered' | 'Partially Received' | 'Received' | 'Cancelled';

export interface PurchaseOrderItem {
  id: number;
  material_id: number;
  quantity_ordered: string;
  unit_cost: string;
  quantity_received: string;
}

export interface PurchaseOrder {
  id: number;
  po_number: string;
  vendor_id: number;
  status: PurchaseOrderStatus;
  notes: string | null;
  created_by?: number;
  created_at: string;
  updated_at?: string;
  items?: PurchaseOrderItem[]; // present on create + get-by-id, absent on list
}

export interface ListPurchaseOrdersResponse {
  purchaseOrders: PurchaseOrder[];
}

export interface GetPurchaseOrderResponse {
  purchaseOrder: PurchaseOrder;
}

export interface CreatePurchaseOrderItemInput {
  materialId: number;
  quantityOrdered: number;
  unitCost: number;
}

export interface CreatePurchaseOrderPayload {
  vendorId: number;
  notes?: string;
  items: CreatePurchaseOrderItemInput[];
}

export interface CreatePurchaseOrderResponse {
  purchaseOrder: PurchaseOrder;
}

// Only these two manual transitions are legal server-side — Partially
// Received/Received are derived by receivePurchaseOrder, never caller-set
// (409 otherwise). Confirmed against updatePoStatusSchema.
export interface UpdatePurchaseOrderStatusPayload {
  status: 'Draft' | 'Ordered' | 'Cancelled';
}

export interface UpdatePurchaseOrderStatusResponse {
  purchaseOrder: PurchaseOrder;
}

export interface ReceivePurchaseOrderItemInput {
  purchaseOrderItemId: number;
  quantityReceived: number;
  lotNumber: string;
}

export interface ReceivePurchaseOrderPayload {
  items: ReceivePurchaseOrderItemInput[];
}

export interface ReceivePurchaseOrderResponse {
  purchaseOrder: PurchaseOrder;
  stockTransactions: MaterialStockTransaction[];
}

// ─── Practice CRM: contracts, notes (accounts.controller.js) ──────────

export interface PracticeContract {
  id: number;
  practice_id: number;
  payment_terms: string;
  credit_limit: string;
  sales_rep_id: number | null;
  contract_start_date: string;
  contract_end_date: string | null;
  created_at: string;
  updated_at?: string;
}

export interface ListPracticeContractsResponse {
  contracts: PracticeContract[];
}

export interface CreatePracticeContractPayload {
  paymentTerms: string;
  creditLimit?: number;
  salesRepId?: number;
  contractStartDate: string;
  contractEndDate?: string;
}

export interface CreatePracticeContractResponse {
  contract: PracticeContract;
}

export interface PracticeNote {
  id: number;
  practice_id: number;
  author_id: number;
  body: string;
  created_at: string;
}

export interface ListPracticeNotesResponse {
  notes: PracticeNote[];
}

export interface CreatePracticeNotePayload {
  body: string;
}

export interface CreatePracticeNoteResponse {
  note: PracticeNote;
}

// ─────────────────────────────────────────────────────────────────────────
// Patients (Frontend Session 5.5 §1) — confirmed live directly against a
// running backend/src/controllers/patients.controller.js
// (POST/GET/GET-by-id/PATCH all hit with curl before writing these types),
// not inferred from the controller source alone. Row fields are
// snake_case (id, practice_id, first_name, last_name, created_at — no
// aliasing), under camelCase wrapper keys (`patient`/`patients`), same
// convention as every other resource in this file. Only firstName/
// lastName exist on the create/update schemas — no other fields exist,
// don't add any on a guess.
// ─────────────────────────────────────────────────────────────────────────

export interface Patient {
  id: number;
  practice_id: number;
  first_name: string;
  last_name: string;
  created_at: string;
}

export interface ListPatientsResponse {
  patients: Patient[];
  pagination: Pagination;
}

export interface GetPatientResponse {
  patient: Patient;
}

export interface ListPatientsQuery {
  practiceId?: number; // required in practice for the practice-scoped tab; optional server-side for internal callers listing across all practices
  page?: number;
  limit?: number;
}

export interface CreatePatientPayload {
  practiceId: number;
  firstName: string;
  lastName: string;
}

export interface CreatePatientResponse {
  patient: Patient;
}

// Both fields optional on the backend (updatePatientSchema — partial
// update, at least one field required or 400 "No updatable fields
// provided") — the frontend form always sends both since it's a
// two-field inline edit, but the type reflects what the schema actually
// allows.
export interface UpdatePatientPayload {
  firstName?: string;
  lastName?: string;
}

export interface UpdatePatientResponse {
  patient: Patient;
}
