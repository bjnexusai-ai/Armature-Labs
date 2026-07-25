import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { MetricCard } from '../components/MetricCard';
import { WorkflowTracker } from '../components/WorkflowTracker';

const EXAMPLE_STEPS = [
  { label: 'Submitted', sub: 'Jul 20', status: 'completed' as const },
  { label: 'Intake', sub: 'Jul 20', status: 'completed' as const },
  { label: 'Design', sub: 'In progress', status: 'active' as const },
  { label: 'Review', sub: 'Pending', status: 'pending' as const },
  { label: 'Production', sub: 'Pending', status: 'pending' as const },
  { label: 'QC', sub: 'Pending', status: 'pending' as const },
  { label: 'Shipping', sub: 'Pending', status: 'pending' as const },
];

export function DashboardPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  // Example data has no real fetch yet, so this timer just demonstrates the
  // skeleton state the Session 2 case-list will actually use once GET
  // /api/cases is wired — a placeholder loading flag, not a real request.
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 550);
    return () => clearTimeout(t);
  }, []);

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="font-display text-lg font-bold text-ink mb-1">
            Frontend Session 1 — App Shell
          </h2>
          <p className="text-sm text-ink-soft max-w-xl">
            Auth, routing, role-based nav, and the full visual system (colors,
            animations, glass effects) are live. The metric numbers and
            workflow steps below are example data — they wire to real
            endpoints in Sessions 2 and 7.
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <MetricCard
          loading={loading}
          value={14}
          label="Active cases"
          iconBg="var(--color-badge-teal-bg)"
          icon={<span className="text-badge-teal text-lg">🦷</span>}
        />
        <MetricCard
          loading={loading}
          value={3}
          label="Pending approval"
          iconBg="var(--color-badge-amber-bg)"
          icon={<span className="text-badge-amber text-lg">⏳</span>}
        />
        <MetricCard
          loading={loading}
          value={5}
          label="Due this week"
          iconBg="var(--color-badge-coral-bg)"
          icon={<span className="text-badge-coral text-lg">📅</span>}
        />
        <MetricCard
          loading={loading}
          value={1}
          label="On hold"
          iconBg="var(--color-badge-green-bg)"
          icon={<span className="text-badge-green text-lg">⏸</span>}
        />
      </div>

      <div className="surface-card fade-in d1 rounded-[18px] p-5 mb-5">
        <div className="flex items-center justify-between mb-0.5">
          <h3 className="font-display text-[15px] font-bold m-0 text-ink tracking-[-0.01em]">Example case pipeline</h3>
          <span className="status-pill" style={{ background: 'var(--color-badge-green-bg)', color: 'var(--color-badge-green)' }}>
            <span className="status-dot live" />
            Live
          </span>
        </div>
        <p className="text-xs text-ink-soft m-0">CASE-2026-00001 · Bright Smile Dental Clinic</p>
        <WorkflowTracker steps={EXAMPLE_STEPS} />
      </div>

      <div className="surface-card rounded-[18px] p-6">
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
