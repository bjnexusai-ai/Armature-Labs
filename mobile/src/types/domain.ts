import type { CasePriority, CaseStatus } from '../constants/caseStatus';

/**
 * All shapes below are transcribed from the live backend controllers
 * (cases.controller.js, notes.controller.js, approvals.controller.js) —
 * field names and nullability match the real SQL SELECTs, not a guess.
 */

export interface CaseSummary {
  id: number;
  case_number: string;
  practice_id: number;
  dentist_id: number;
  case_type_id: number;
  patient_name: string | null;
  patient_reference_id: string | null;
  rx_instructions: string | null;
  priority: CasePriority;
  due_date: string; // YYYY-MM-DD
  current_status: CaseStatus;
  prior_status: CaseStatus | null;
  assigned_staff_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CasesListResponse {
  cases: CaseSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CaseStageHistoryEntry {
  id: number;
  stage_id: number;
  stage_name: string;
  assigned_technician_id: number | null;
  started_at: string;
  completed_at: string | null;
  status: string;
  notes: string | null;
}

export interface CaseStatusAuditEntry {
  id: number;
  changed_by: number;
  changed_by_name: string;
  old_status: CaseStatus | null;
  new_status: CaseStatus;
  remarks: string | null;
  changed_at: string;
}

export interface CaseDetailResponse {
  case: CaseSummary;
  currentStage: CaseStageHistoryEntry | null;
  recentStatusAudit: CaseStatusAuditEntry[];
}

export interface CaseNote {
  id: number;
  case_id: number;
  author_id: number;
  body: string;
  visibility: 'internal' | 'portal';
  created_at: string;
}

export interface CaseNotesResponse {
  notes: CaseNote[];
}

export interface CaseNoteCreateResponse {
  note: CaseNote;
}

export type ApprovalStage = 'design' | 'bisque';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface Approval {
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

export interface ApprovalsListResponse {
  approvals: Approval[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Invoices — transcribed from billing.controller.js's real SELECTs
 * (`listInvoices`/`getInvoice`), M4. Two things confirmed against the
 * live repo that don't match the client's own docx §8 field list
 * (0024_invoice_client_fields.js added `due_date`, `tax_amount`,
 * `paid_date` columns to the `invoices` table) — but NONE of the three
 * controller SELECTs (list, detail, or the create INSERT) actually read
 * or write them. So even though the columns exist in Postgres, the API
 * never surfaces them. Not included below — see MOBILE_LOG.md M4 entry,
 * this is flagged as a backend gap, not silently worked around.
 *
 * Money fields (`subtotal`, `amount_paid`, `unit_price`, `line_total`,
 * `amount`) are `numeric(10,2)` columns (0016_invoices_and_payments.js).
 * node-postgres has no custom type parser configured (config/db.js), so
 * these come over the wire as strings, not numbers — typed as `string`
 * here deliberately, not assumed to be numeric just because they're
 * dollar amounts.
 */
export type InvoiceStatus = 'Draft' | 'Sent' | 'Partially Paid' | 'Paid' | 'Void';

/**
 * Shape returned by `GET /api/billing/invoices` for a `dentist_client`.
 * Note `notes` is NOT selected on this branch (it is on the internal-staff
 * branch of the same endpoint) — omitted here on purpose, not an
 * oversight, since mobile only ever hits this endpoint as a dentist_client.
 */
export interface InvoiceSummary {
  id: number;
  invoice_number: string;
  practice_id: number;
  status: InvoiceStatus;
  subtotal: string;
  amount_paid: string;
  created_at: string;
}

export interface InvoicesListResponse {
  // No `pagination` block — unlike /api/cases and /api/approvals,
  // listInvoices returns the bare array with no paging wrapper. Don't add
  // one; there is nothing to page through in the real response.
  invoices: InvoiceSummary[];
}

export interface InvoiceLineItem {
  id: number;
  case_id: number | null;
  description: string;
  quantity: number;
  unit_price: string;
  line_total: string;
}

export interface InvoicePayment {
  id: number;
  amount: string;
  method: string;
  reference_note: string | null;
  created_at: string;
}

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
  payments: InvoicePayment[];
}

export interface InvoiceDetailResponse {
  invoice: InvoiceDetail;
}
