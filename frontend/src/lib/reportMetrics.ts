import type { ApprovalRecord, CaseRecord, CaseStatus, Practice } from './caseTypes';
import { ALL_STATUSES } from './caseTypes';
import { listApprovals } from './api';

/**
 * Session 7 Chunk 2 — aggregation helpers backing the Reports page's three
 * charts. Same discipline as dashboardMetrics.ts: pure functions, no mock
 * data, no fetching mixed into the math so the mapping decisions here are
 * separately readable/testable from ReportsPage's data loading.
 *
 * Per SESSION_7_PROMPT §1.1: none of these three charts has a dedicated
 * backend aggregate endpoint (confirmed — reports.controller.js only
 * exposes saved_reports CRUD, no "generate" verb; report *generation* is
 * explicitly out of scope for backend Session 7 per that controller's own
 * top comment). So all three are computed client-side from data already
 * exposed by GET /api/cases, GET /api/approvals, and GET /api/practices —
 * exactly the sources the prompt names as the fallback.
 */

export type RangeKey = '7D' | '6W' | '90D';

// ── Donut — Cases by status ────────────────────────────────────────────
export interface StatusCount {
  status: CaseStatus;
  count: number;
}

/** Every status in ALL_STATUSES order (not just ones with data) so the
 * legend is stable and doesn't reflow as data changes; zero-count statuses
 * are filtered out by the chart component itself at render time. */
export function casesByStatus(cases: CaseRecord[]): StatusCount[] {
  const counts = new Map<CaseStatus, number>();
  for (const status of ALL_STATUSES) counts.set(status, 0);
  for (const c of cases) counts.set(c.current_status, (counts.get(c.current_status) ?? 0) + 1);
  return ALL_STATUSES.map((status) => ({ status, count: counts.get(status) ?? 0 }));
}

// ── Line — Approval response time ──────────────────────────────────────
export interface ResponseTimePoint {
  label: string;
  avgHours: number | null; // null = no responses that bucket, render as gap not 0
  sampleSize: number;
}

function rangeToBuckets(range: RangeKey): { days: number; bucketDays: number; count: number } {
  if (range === '7D') return { days: 7, bucketDays: 1, count: 7 };
  if (range === '6W') return { days: 42, bucketDays: 7, count: 6 };
  return { days: 90, bucketDays: 15, count: 6 }; // 90D -> 6 buckets of 15 days
}

/**
 * GET /api/approvals has no dedicated "average response time" aggregate
 * (confirmed against approvals.controller.js — it's a plain paginated
 * list), so this pages through real rows and buckets `responded_at -
 * created_at` client-side. Only approved/rejected rows have a
 * `responded_at` (pending ones are null per the controller's own UPDATE
 * statements) — pending rows are excluded from the average, not counted
 * as 0-hour responses.
 */
export async function fetchApprovalsForRange(range: RangeKey, maxPages = 5): Promise<ApprovalRecord[]> {
  const { days } = rangeToBuckets(range);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const all: ApprovalRecord[] = [];
  let page = 1;
  // eslint-disable-next-line no-constant-condition
  while (page <= maxPages) {
    const res = await listApprovals({ page, limit: 100 });
    all.push(...res.approvals);
    // approvals are ORDER BY created_at DESC (controller's own query), so
    // once a page's oldest row is past the cutoff, later pages are too —
    // safe to stop paging early rather than always walking all 5 pages.
    const oldestOnPage = res.approvals[res.approvals.length - 1];
    const pastCutoff = oldestOnPage && new Date(oldestOnPage.created_at) < cutoff;
    if (pastCutoff || page >= res.pagination.totalPages) break;
    page++;
  }
  return all.filter((a) => new Date(a.created_at) >= cutoff);
}

export function approvalResponseTimeSeries(approvals: ApprovalRecord[], range: RangeKey): ResponseTimePoint[] {
  const { bucketDays, count } = rangeToBuckets(range);
  const now = new Date();
  now.setHours(23, 59, 59, 999);

  const responded = approvals.filter((a) => a.status !== 'pending' && a.responded_at);

  const buckets: { start: Date; end: Date; hours: number[] }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const end = new Date(now);
    end.setDate(end.getDate() - i * bucketDays);
    const start = new Date(end);
    start.setDate(start.getDate() - bucketDays);
    buckets.push({ start, end, hours: [] });
  }

  for (const a of responded) {
    const responded_ = new Date(a.responded_at as string);
    const bucket = buckets.find((b) => responded_ > b.start && responded_ <= b.end);
    if (!bucket) continue;
    const hours = (responded_.getTime() - new Date(a.created_at).getTime()) / (1000 * 60 * 60);
    if (hours >= 0) bucket.hours.push(hours);
  }

  return buckets.map((b) => ({
    label: formatBucketLabel(b.end, bucketDays),
    avgHours: b.hours.length ? Math.round((b.hours.reduce((s, h) => s + h, 0) / b.hours.length) * 10) / 10 : null,
    sampleSize: b.hours.length,
  }));
}

function formatBucketLabel(end: Date, bucketDays: number): string {
  if (bucketDays === 1) return end.toLocaleDateString(undefined, { weekday: 'short' });
  return end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ── Bar — Top practices by volume (last 30 days) ───────────────────────
export interface PracticeVolume {
  practiceId: number;
  practiceName: string;
  count: number;
}

/**
 * "Cases submitted, last 30 days, per practice" (spec's exact wording) —
 * bucketed by `created_at`, not `due_date` or `updated_at`, since "submitted"
 * maps to when the case entered the system. Top 8 only, matching the
 * reference demo's bar chart not trying to render every practice at once.
 */
export function topPracticesByVolume(cases: CaseRecord[], practices: Practice[], days = 30): PracticeVolume[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);

  const nameById = new Map(practices.map((p) => [p.id, p.practice_name]));
  const counts = new Map<number, number>();
  for (const c of cases) {
    if (new Date(c.created_at) < cutoff) continue;
    counts.set(c.practice_id, (counts.get(c.practice_id) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([practiceId, count]) => ({
      practiceId,
      practiceName: nameById.get(practiceId) ?? `Practice #${practiceId}`,
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}
