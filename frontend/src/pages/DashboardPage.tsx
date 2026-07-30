import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { roleLabel } from '../lib/authTypes';
import { MetricCard } from '../components/MetricCard';
import { CaseSnapshotHero } from '../components/CaseSnapshotHero';
import { TodaysWorkflowPanel } from '../components/TodaysWorkflowPanel';
import { ActionRequiredQueue } from '../components/ActionRequiredQueue';
import { DonutChart } from '../components/DonutChart';
import { LineChart } from '../components/LineChart';
import { BarChart } from '../components/BarChart';
import { NewCaseModal } from '../components/NewCaseModal';
import {
  approvalResponseTimeSeries,
  casesByStatus,
  fetchApprovalsForRange,
  topPracticesByVolume,
  type RangeKey,
} from '../lib/reportMetrics';
import { listApprovals, listCaseTypes, listPractices } from '../lib/api';
import {
  buildExceptionQueueItems,
  computeDashboardMetrics,
  computeTodaysWorkflow,
  fetchAllCasesForDashboard,
  pickHeroCase,
  type ActionQueueItem,
  type DashboardMetrics,
  type WorkflowStepData,
} from '../lib/dashboardMetrics';
import { STATUS_COLORS } from '../lib/statusColors';
import type { CaseRecord, Practice } from '../lib/caseTypes';

/**
 * Session 7 §0.2 retrofit — real Dashboard, replacing the Session 1
 * placeholder (example steps, hardcoded metric numbers 14/3/5/1, no hero
 * card, no tooth mark, no "Today's workflow" stepper). Confirmed via direct
 * inspection this file was still headed "Frontend Session 1 — App Shell"
 * before this change — see FRONTEND_LOG.md's Session 7 entry for the full
 * retrofit note.
 */
export function DashboardPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [heroCase, setHeroCase] = useState<CaseRecord | null>(null);
  const [heroCaseTypeName, setHeroCaseTypeName] = useState<string | null>(null);
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStepData[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    activeCases: 0,
    pendingApproval: 0,
    dueThisWeek: 0,
    onHold: 0,
  });
  const [queueItems, setQueueItems] = useState<ActionQueueItem[]>([]);
  const [queueTotalCount, setQueueTotalCount] = useState(0);
  const [newCaseOpen, setNewCaseOpen] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  // Backing data for the 3 dashboard charts (§0.1/§0.2 never wired these in
  // — they were built in a separate Session 7 chunk for ReportsPage. Same
  // helpers/colors reused here verbatim, no new aggregation logic invented.
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [practices, setPractices] = useState<Practice[]>([]);
  const [range, setRange] = useState<RangeKey>('7D');
  const [responseSeries, setResponseSeries] = useState<ReturnType<typeof approvalResponseTimeSeries>>([]);
  const [lineLoading, setLineLoading] = useState(true);
  const [isolatedStatus, setIsolatedStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [allCases, pendingApprovals, practicesRes, caseTypesRes] = await Promise.all([
          fetchAllCasesForDashboard(),
          listApprovals({ status: 'pending', limit: 100 }),
          listPractices(),
          listCaseTypes(),
        ]);
        if (cancelled) return;

        setCases(allCases);
        setPractices(practicesRes.practices);

        const practiceNames: Record<number, string> = {};
        for (const p of practicesRes.practices) practiceNames[p.id] = p.practice_name;

        const caseTypeNames: Record<number, string> = {};
        for (const t of caseTypesRes.caseTypes) caseTypeNames[t.id] = t.name;

        const hero = pickHeroCase(allCases);
        setHeroCase(hero);
        setHeroCaseTypeName(hero ? (caseTypeNames[hero.case_type_id] ?? null) : null);

        setWorkflowSteps(computeTodaysWorkflow(allCases));
        setMetrics(computeDashboardMetrics(allCases, pendingApprovals.pagination.total));

        // Combine pending-approval rows (from GET /api/approvals, which
        // already carries case_number/patient_name/practice_id join
        // fields) with Delayed/Case on Hold rows built off the case list
        // already fetched above — one queue, two real sources, no
        // duplicate case shown twice if a case happens to be both (an
        // exception-status case is excluded from the linear approval
        // statuses anyway, so this can't double up in practice).
        const approvalItems: ActionQueueItem[] = pendingApprovals.approvals.map((a) => ({
          key: `approval-${a.id}`,
          caseId: a.case_id,
          caseNumber: a.case_number,
          patientLabel: a.patient_name ?? '—',
          practiceLabel: practiceNames[a.practice_id] ?? `Practice #${a.practice_id}`,
          status: a.case_current_status,
        }));
        const exceptionItems = buildExceptionQueueItems(allCases, practiceNames);
        // The dashboard panel is a short "at a glance" preview (matches the
        // reference file's 3-row example), not the full queue — the full,
        // filterable list already exists on the Approvals/Case Queue pages.
        // Previously this rendered every fetched approval with no cap (up
        // to the 100-row fetch limit), which is why the panel could scroll
        // through dozens of rows. Exceptions (Delayed/On Hold) surface
        // first since they're the more time-sensitive of the two.
        const DASHBOARD_QUEUE_PREVIEW_SIZE = 6;
        const combined = [...exceptionItems, ...approvalItems];
        setQueueItems(combined.slice(0, DASHBOARD_QUEUE_PREVIEW_SIZE));
        setQueueTotalCount(combined.length);
      } catch {
        if (!cancelled) showToast('Could not load dashboard data. Is the backend running?');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadTick]);

  // Line chart re-fetches independently of the range toggle, same pattern
  // ReportsPage already uses for the identical chart.
  useEffect(() => {
    let cancelled = false;
    setLineLoading(true);
    fetchApprovalsForRange(range)
      .then((approvals) => {
        if (!cancelled) setResponseSeries(approvalResponseTimeSeries(approvals, range));
      })
      .catch(() => {
        if (!cancelled) setResponseSeries([]);
      })
      .finally(() => {
        if (!cancelled) setLineLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  const statusSlices = casesByStatus(cases).map((s) => ({
    key: s.status,
    label: s.status,
    value: s.count,
    color: STATUS_COLORS[s.status].text,
  }));
  const practiceVolume = topPracticesByVolume(cases, practices, 30).slice(0, 5);

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="text-sm text-ink-soft max-w-xl">
            Operational snapshot across all active practices.
            {user && <> Signed in as {roleLabel(user.role)}.</>}
          </p>
        </div>
        <button
          onClick={() => setNewCaseOpen(true)}
          className="shrink-0 rounded-lg text-white font-semibold text-sm px-4.5 py-2.5 transition-transform hover:-translate-y-0.5"
          style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
        >
          + New Case
        </button>
      </div>

      <CaseSnapshotHero caseRecord={heroCase} caseTypeName={heroCaseTypeName} loading={loading} />

      <TodaysWorkflowPanel steps={workflowSteps} loading={loading} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <MetricCard
          loading={loading}
          value={metrics.activeCases}
          label="Active cases"
          iconBg="var(--color-badge-teal-bg)"
          icon={
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-badge-teal">
              <path d="M12 3c-2.2 0-3.4 1.3-4.5 1.3S5.4 3.4 4 3.9c-1.6.6-2 2.8-1.6 5C3 11.4 4 12.5 4.3 15c.3 2.2.7 5.5 2.2 5.5 1.6 0 1.2-3.6 2.3-3.6s.8 3.6 2.3 3.6c1.7 0 2-4 2.3-6 .1-.9.6-1.5 1.1-1.5s1 .6 1.1 1.5c.3 2 .6 6 2.3 6 1.5 0 1.9-3.3 2.2-5.5.3-2.5 1.3-3.6 1.9-6.1.4-2.2 0-4.4-1.6-5-1.4-.5-2.4.4-3.5.4S14.2 3 12 3Z"/>
            </svg>
          }
        />
        <MetricCard
          loading={loading}
          value={metrics.pendingApproval}
          label="Pending approval"
          iconBg="var(--color-badge-amber-bg)"
          icon={
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-badge-amber">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 7.5V12l3 2" />
            </svg>
          }
        />
        <MetricCard
          loading={loading}
          value={metrics.dueThisWeek}
          label="Due this week"
          iconBg="var(--color-badge-coral-bg)"
          icon={
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-badge-coral">
              <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
              <path d="M3.5 9.5h17M8 3v3M16 3v3" />
            </svg>
          }
        />
        <MetricCard
          loading={loading}
          value={metrics.onHold}
          label="On hold"
          iconBg="var(--color-badge-green-bg)"
          icon={
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-badge-green">
              <path d="M9 5v14M15 5v14" />
            </svg>
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <div className="surface-card rounded-[18px] p-5">
          <h3 className="font-display text-body-lg font-bold text-ink mb-1">Cases by status</h3>
          <p className="text-xs text-ink-soft mb-4">All active cases, last 30 days · click a segment to isolate it.</p>
          {loading ? (
            <div className="skeleton h-[180px] rounded-lg" />
          ) : (
            <DonutChart
              slices={statusSlices}
              isolatedKey={isolatedStatus}
              onToggleIsolate={setIsolatedStatus}
              centerLabel="Cases"
            />
          )}
        </div>

        <div className="surface-card rounded-[18px] p-5">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
            <h3 className="font-display text-body-lg font-bold text-ink">Approval response time</h3>
            <div className="range-toggle">
              {(['7D', '6W', '90D'] as RangeKey[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`range-btn ${range === r ? 'active' : ''}`}
                  onClick={() => setRange(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-ink-soft mb-4">Average hours between an approval being requested and responded to.</p>
          {lineLoading ? (
            <div className="skeleton h-[220px] rounded-lg" />
          ) : (
            <LineChart
              points={responseSeries.map((p) => ({ label: p.label, value: p.avgHours, sampleSize: p.sampleSize }))}
              valueSuffix="h"
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ActionRequiredQueue items={queueItems} loading={loading} totalCount={queueTotalCount} />

        <div className="surface-card rounded-[18px] p-5">
          <h3 className="font-display text-body-lg font-bold text-ink mb-1">Top practices by volume</h3>
          <p className="text-xs text-ink-soft mb-4">Cases submitted, last 30 days.</p>
          {loading ? (
            <div className="skeleton h-[200px] rounded-lg" />
          ) : (
            <BarChart
              data={practiceVolume.map((p) => ({ key: String(p.practiceId), label: p.practiceName, value: p.count }))}
              emptyTitle="No submissions in the last 30 days"
              emptyBody="Cases created in this window will show up here by practice."
            />
          )}
        </div>
      </div>

      <NewCaseModal
        open={newCaseOpen}
        onClose={() => setNewCaseOpen(false)}
        onCreated={() => setReloadTick((t) => t + 1)}
      />
    </div>
  );
}
