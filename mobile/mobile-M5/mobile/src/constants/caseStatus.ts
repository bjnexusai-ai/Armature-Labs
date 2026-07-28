/**
 * Case status — confirmed against the live backend
 * (backend/src/utils/caseStatus.js + migrations/0006_cases.js). The
 * 10-status lifecycle is authoritative; do not invent additional
 * statuses. 'Delivered' is terminal. 'Case on Hold' / 'Delayed' are
 * exception states reachable from any active linear status.
 */
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

export const CASE_PRIORITIES = ['Standard', 'Rush', 'Urgent'] as const;
export type CasePriority = (typeof CASE_PRIORITIES)[number];

/**
 * Maps each status to one of theme.ts's five badge tones. Not specified
 * by the backend (statuses are just strings there) — this mapping is a
 * mobile-side UI decision, documented here so it's changed in one place.
 * Rationale: teal = active/in-progress default, green = terminal success,
 * amber = pending an approval action, coral = exception/blocked, tan =
 * unused for now (kept available for a future distinct bucket).
 */
export const STATUS_TONE: Record<CaseStatus, 'teal' | 'green' | 'coral' | 'amber' | 'tan'> = {
  'Case Entered': 'teal',
  'In Design': 'teal',
  'Pending Design Approval': 'amber',
  Processing: 'teal',
  'Pending Bisque Approval': 'amber',
  Finalizing: 'teal',
  'Shipped Out': 'teal',
  Delivered: 'green',
  'Case on Hold': 'coral',
  Delayed: 'coral',
};
