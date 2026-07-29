import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { roleLabel } from '../lib/authTypes';
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
          <p className="text-sm text-ink-soft max-w-xl">
            Operational snapshot across all active practices.
            {user && <> Signed in as {roleLabel(user.role)}.</>}
          </p>
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

      <ActionRequiredQueue items={queueItems} loading={loading} />
    </div>
  );
}
