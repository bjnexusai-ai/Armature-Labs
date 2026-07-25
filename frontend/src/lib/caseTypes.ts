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
