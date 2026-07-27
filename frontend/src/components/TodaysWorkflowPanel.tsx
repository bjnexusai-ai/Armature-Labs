import type { WorkflowStepData } from '../lib/dashboardMetrics';

interface TodaysWorkflowPanelProps {
  steps: WorkflowStepData[];
  loading?: boolean;
}

/**
 * Session 7 §0.2 retrofit — "Today's workflow" panel ported from the
 * reference demo. Deliberately NOT reusing the existing WorkflowTracker
 * component: that one renders a single case's per-stage checklist (a
 * `completed | active | pending` list keyed to one case's own history),
 * a different shape of data from this panel's lab-wide aggregate counts
 * — confirmed by reading WorkflowTracker.tsx directly, per the Session 7
 * prompt's explicit instruction not to assume it's reusable as-is.
 */
export function TodaysWorkflowPanel({ steps, loading }: TodaysWorkflowPanelProps) {
  return (
    <div className="surface-card fade-in rounded-[18px] p-5 mb-5">
      <h3 className="font-display text-[15px] font-bold m-0 text-ink tracking-[-0.01em]">Today's workflow</h3>
      <p className="text-xs text-ink-soft mt-0.5 mb-0">Live case pipeline across the lab</p>
      <div className="flex justify-between items-start mt-4.5 flex-wrap gap-2.5">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div className="contents" key={i}>
                <div className="w-[100px] text-center">
                  <div className="skeleton w-11 h-11 rounded-full mx-auto" />
                  <div className="skeleton h-3 w-14 rounded mx-auto mt-2.5" />
                </div>
                {i < 5 && <div className="wf-connector" />}
              </div>
            ))
          : steps.map((step, i) => (
              <div className="contents" key={step.label}>
                <div className="w-[100px] text-center">
                  <div className={`wf-step ${step.status}`}>
                    <div className="wf-dot">
                      {step.status === 'completed' && <span className="text-white font-bold text-sm">✓</span>}
                    </div>
                  </div>
                  <h5 className="mt-2.5 mb-0 text-[13px] font-bold text-ink">{step.label}</h5>
                  <small className="block mt-0.5 text-ink-soft text-[11.5px]">{step.sub}</small>
                </div>
                {i < steps.length - 1 && <div className="wf-connector" />}
              </div>
            ))}
      </div>
    </div>
  );
}
