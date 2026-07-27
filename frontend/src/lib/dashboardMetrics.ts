import type { CaseRecord, CaseStatus } from './caseTypes';
import { LINEAR_STATUSES } from './caseTypes';
import { listCases } from './api';

/**
 * Session 7 §0.2 retrofit — aggregation helpers backing the Dashboard hero
 * card, "Today's workflow" stepper, and the four MetricCards. Kept as pure
 * functions (no fetching, no React) so the mapping decisions below are
 * readable and testable on their own, separate from DashboardPage's data
 * loading.
 */

// GET /api/cases caps `limit` at 100 server-side (cases.controller.js's
// listCasesQuerySchema). There's no dedicated aggregate/count endpoint for
// the dashboard, so this pages through the real list — capped at 5 pages
// (500 cases) as a safety valve for a lab this size. Documented limitation,
// not a silent guess: if case volume ever exceeds 500, these aggregates
// under-count and a dedicated backend aggregate endpoint should replace
// this — flagged in FRONTEND_LOG.md rather than left implicit.
export async function fetchAllCasesForDashboard(maxPages = 5): Promise<CaseRecord[]> {
  const first = await listCases({ limit: 100, page: 1 });
  const all = [...first.cases];
  const totalPages = Math.min(first.pagination.totalPages, maxPages);
  for (let page = 2; page <= totalPages; page++) {
    const next = await listCases({ limit: 100, page });
    all.push(...next.cases);
  }
  return all;
}

export interface DashboardMetrics {
  activeCases: number;
  pendingApproval: number;
  dueThisWeek: number;
  onHold: number;
}

/**
 * `pendingApprovalCount` is passed in separately (from GET /api/approvals's
 * own pagination.total) rather than derived from case status here, since
 * the approvals table — not case status alone — is the authoritative count
 * the notification bell already uses (AppShell.tsx, Session 3).
 */
export function computeDashboardMetrics(cases: CaseRecord[], pendingApprovalCount: number): DashboardMetrics {
  const activeCases = cases.filter((c) => c.current_status !== 'Delivered').length;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekOut = new Date(today);
  weekOut.setDate(weekOut.getDate() + 7);

  const dueThisWeek = cases.filter((c) => {
    if (c.current_status === 'Delivered') return false;
    const due = new Date(`${c.due_date}T00:00:00`);
    return due >= today && due < weekOut;
  }).length;

  const onHold = cases.filter((c) => c.current_status === 'Case on Hold' || c.current_status === 'Delayed').length;

  return { activeCases, pendingApproval: pendingApprovalCount, dueThisWeek, onHold };
}

/**
 * Hero "Case Snapshot" card — most recently updated case that isn't
 * terminal (Delivered). This is the real selection logic (not a hardcoded
 * "pick case #1" shortcut, per the Session 7 prompt's explicit instruction
 * to confirm this before hardcoding).
 */
export function pickHeroCase(cases: CaseRecord[]): CaseRecord | null {
  const inProgress = cases.filter((c) => c.current_status !== 'Delivered');
  if (inProgress.length === 0) return null;
  return [...inProgress].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  )[0];
}

/**
 * Stage completion % for the hero card, derived from the case's position in
 * the real 8-step linear status list (caseStatus.js's LINEAR_STATUSES), not
 * a per-case field the backend doesn't expose. Exception statuses (Case on
 * Hold / Delayed) have no linear index — callers should show the status
 * pill instead of a % for those, this returns null rather than a fake 0.
 */
export function stagePercent(status: CaseStatus): number | null {
  const idx = LINEAR_STATUSES.indexOf(status as (typeof LINEAR_STATUSES)[number]);
  if (idx === -1) return null;
  return Math.round((idx / (LINEAR_STATUSES.length - 1)) * 100);
}

export interface WorkflowStepData {
  label: string;
  sub: string;
  status: 'completed' | 'active' | 'pending';
}

/**
 * "Today's workflow" stepper (Received -> Scanning -> Design -> Approval ->
 * Printing -> Shipping), backed by real current_status counts.
 *
 * Documented mapping decision (the backend's 10-status lifecycle has no
 * distinct "Scanning" sub-status — caseStatus.js's own comment says
 * intake/scanning is an internal sub-step of "Case Entered", not a
 * separate status, and confirms "Case Entered" maps to the 7-step
 * tracker's "Submitted" stage):
 *   - Received  = every case ever created (running total, matches the
 *                  reference's own "56 cases" style caption)
 *   - Scanning   = cases currently sitting in "Case Entered" (received,
 *                  not yet moved into design — i.e. still queued for
 *                  intake/scanning)
 *   - Design     = "In Design"
 *   - Approval   = "Pending Design Approval" + "Pending Bisque Approval"
 *   - Printing   = "Processing" + "Finalizing"
 *   - Shipping   = "Shipped Out"
 * "Delivered" is intentionally excluded from every bucket above (terminal,
 * already shipped and closed out, not part of today's active pipeline).
 */
export function computeTodaysWorkflow(cases: CaseRecord[]): WorkflowStepData[] {
  const countBy = (statuses: CaseStatus[]) =>
    cases.filter((c) => statuses.includes(c.current_status)).length;

  const raw: { label: string; count: number; suffix: string; emptyLabel: string }[] = [
    { label: 'Received', count: cases.length, suffix: 'case', emptyLabel: 'No cases yet' },
    { label: 'Scanning', count: countBy(['Case Entered']), suffix: 'queued', emptyLabel: 'Finished' },
    { label: 'Design', count: countBy(['In Design']), suffix: 'active', emptyLabel: 'None active' },
    {
      label: 'Approval',
      count: countBy(['Pending Design Approval', 'Pending Bisque Approval']),
      suffix: 'pending',
      emptyLabel: 'None pending',
    },
    { label: 'Printing', count: countBy(['Processing', 'Finalizing']), suffix: 'in queue', emptyLabel: 'Queue empty' },
    { label: 'Shipping', count: countBy(['Shipped Out']), suffix: 'today', emptyLabel: 'None today' },
  ];

  return raw.map((step, i) => {
    const laterHasWork = raw.slice(i + 1).some((s) => s.count > 0);
    const status: WorkflowStepData['status'] = step.count > 0 ? 'active' : laterHasWork ? 'completed' : 'pending';
    let sub: string;
    if (step.count === 0) {
      sub = step.emptyLabel;
    } else if (step.suffix === 'case') {
      sub = `${step.count} case${step.count === 1 ? '' : 's'}`;
    } else {
      sub = `${step.count} ${step.suffix}`;
    }
    return { label: step.label, sub, status };
  });
}

export interface ActionQueueItem {
  key: string;
  caseId: number;
  caseNumber: string;
  patientLabel: string;
  practiceLabel: string;
  status: CaseStatus;
}

/**
 * "Action required queue" (§0.1 retrofit) — cases needing staff attention:
 * anything Delayed / Case on Hold, real current_status pulled straight off
 * the already-fetched case list (no separate endpoint needed for this
 * half). Pending-approval rows are built separately in DashboardPage from
 * GET /api/approvals (already the notification bell's data source, per
 * AppShell.tsx) since that endpoint carries the case_number/patient_name
 * join fields the plain case list doesn't.
 */
export function buildExceptionQueueItems(
  cases: CaseRecord[],
  practiceNames: Record<number, string>
): ActionQueueItem[] {
  return cases
    .filter((c) => c.current_status === 'Delayed' || c.current_status === 'Case on Hold')
    .map((c) => ({
      key: `case-${c.id}`,
      caseId: c.id,
      caseNumber: c.case_number,
      patientLabel: c.patient_name ?? '—',
      practiceLabel: practiceNames[c.practice_id] ?? `Practice #${c.practice_id}`,
      status: c.current_status,
    }));
}
