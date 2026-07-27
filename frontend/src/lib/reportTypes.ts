// Session 7 Chunk 2 — saved_reports types. Confirmed against
// backend/src/controllers/reports.controller.js directly (not guessed):
// the table is a reusable-filter-preset resource ("views, not separate
// storage" per the Master Frontend Plan's own §1.1 instruction) — creating
// one does NOT run/generate a report against live data, it just saves a
// name + reportType + filters blob for later reuse. Row shape confirmed
// snake_case under a camelCase `savedReport`/`savedReports` wrapper key,
// same pattern as every other resource in this codebase (materials,
// practices, etc.) — consistent with the standing convention, not assumed
// from it.

export const REPORT_TYPES = [
  'Case Volume',
  'Turnaround Time',
  'Approval Response Time',
  'On Hold And Delayed',
  'Upcoming Due Dates',
  'Revenue',
  'Client Activity',
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

export interface SavedReport {
  id: number;
  owner_id: number;
  name: string;
  report_type: ReportType;
  filters: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ListSavedReportsResponse {
  savedReports: SavedReport[];
}

export interface CreateSavedReportPayload {
  name: string;
  reportType: ReportType;
  filters?: Record<string, unknown>;
}

export interface CreateSavedReportResponse {
  savedReport: SavedReport;
}
