interface WorkflowStep {
  label: string;
  sub: string;
  status: 'completed' | 'active' | 'pending';
}

interface WorkflowTrackerProps {
  steps: WorkflowStep[];
}

/**
 * The 7-step internal sub-stage tracker (Received/Submitted -> Scanning ->
 * Design -> Approval -> Printing -> Shipping etc.) from the decisions log —
 * restyled entirely in the teal/green palette, purple/blue rejected as
 * off-brand. Real per-case data wires up once GET /api/cases/:id's
 * currentStage is consumed (Frontend Session 2); this component is the
 * visual piece, ready for that data.
 */
export function WorkflowTracker({ steps }: WorkflowTrackerProps) {
  return (
    <div className="flex justify-between items-start mt-4.5 flex-wrap gap-2.5">
      {steps.map((step, i) => (
        <div className="contents" key={step.label}>
          <div className="w-[100px] text-center">
            <div className={`wf-step ${step.status}`}>
              <div className="wf-dot">
                {step.status === 'completed' && (
                  <span className="text-white font-bold text-sm">✓</span>
                )}
              </div>
            </div>
            <h5 className="mt-2.5 mb-0 text-[13px] font-bold text-ink">{step.label}</h5>
            <small className="block mt-0.5 text-ink-soft text-[11.5px]">{step.sub}</small>
          </div>
          {i < steps.length - 1 && <div className="wf-connector" />}
        </div>
      ))}
    </div>
  );
}
