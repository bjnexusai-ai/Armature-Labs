import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { MetricCard } from '../components/MetricCard';
import { CaseSnapshotHero } from '../components/CaseSnapshotHero';
import { TodaysWorkflowPanel } from '../components/TodaysWorkflowPanel';
import { ActionRequiredQueue } from '../components/ActionRequiredQueue';
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
import type { CaseRecord } from '../lib/caseTypes';

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
        setQueueItems([...approvalItems, ...exceptionItems]);
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
  }, []);

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="font-display text-lg font-bold text-ink mb-1">Dashboard</h2>
          <p className="text-sm text-ink-soft max-w-xl">Operational snapshot across all active practices.</p>
        </div>
        <button
          onClick={() => showToast('This is what a real action confirmation will look like')}
          className="btn-primary shrink-0 rounded-lg text-white font-semibold text-sm px-4.5 py-2.5 transition-transform hover:-translate-y-0.5"
          style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
        >
          Preview a toast
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
          icon={<span className="text-badge-teal text-lg">🦷</span>}
        />
        <MetricCard
          loading={loading}
          value={metrics.pendingApproval}
          label="Pending approval"
          iconBg="var(--color-badge-amber-bg)"
          icon={<span className="text-badge-amber text-lg">⏳</span>}
        />
        <MetricCard
          loading={loading}
          value={metrics.dueThisWeek}
          label="Due this week"
          iconBg="var(--color-badge-coral-bg)"
          icon={<span className="text-badge-coral text-lg">📅</span>}
        />
        <MetricCard
          loading={loading}
          value={metrics.onHold}
          label="On hold"
          iconBg="var(--color-badge-green-bg)"
          icon={<span className="text-badge-green text-lg">⏸</span>}
        />
      </div>

      <ActionRequiredQueue items={queueItems} loading={loading} />

      <div className="surface-card rounded-[18px] p-6 mt-5">
        <h2 className="font-display text-[15px] font-bold text-ink tracking-[-0.01em] mb-3">Signed in as</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm max-w-md">
          <dt className="text-ink-soft">Name</dt>
          <dd className="text-ink font-medium">{user?.fullName}</dd>
          <dt className="text-ink-soft">Email</dt>
          <dd className="text-ink font-medium">{user?.email}</dd>
          <dt className="text-ink-soft">Role</dt>
          <dd className="text-ink font-medium">{user?.role}</dd>
          <dt className="text-ink-soft">Can approve photos</dt>
          <dd className="text-ink font-medium">{String(user?.canApprovePhotos)}</dd>
          <dt className="text-ink-soft">Can view invoices</dt>
          <dd className="text-ink font-medium">{String(user?.canViewInvoices)}</dd>
          <dt className="text-ink-soft">Can edit patient info</dt>
          <dd className="text-ink font-medium">{String(user?.canEditPatientInfo)}</dd>
        </dl>
      </div>
    </div>
  );
}
