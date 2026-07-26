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
  due_date: string; // ISO date (YYYY-MM-DD)
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
// CaseRecord/ApprovalRecord. No `dueDate`/`taxAmount`/`paidDate` fields yet
// — that's Session 5.5's still-open controller work per
// PARALLEL_BUILD_PROTOCOL.md §4. Don't add them on a guess.
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
export interface InvoiceListRow {
  id: number;
  invoice_number: string;
  practice_id: number;
  status: InvoiceStatus;
  subtotal: string;
  amount_paid: string;
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
