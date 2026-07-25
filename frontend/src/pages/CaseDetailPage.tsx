import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, getCase, getPractice } from '../lib/api';
import type { CaseRecord, StageHistoryEntry, StatusAuditEntry } from '../lib/caseTypes';
import { StatusPill } from '../components/StatusPill';
import { PRIORITY_COLORS } from '../lib/statusColors';

export function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [caseRecord, setCaseRecord] = useState<CaseRecord | null>(null);
  const [currentStage, setCurrentStage] = useState<StageHistoryEntry | null>(null);
  const [audit, setAudit] = useState<StatusAuditEntry[]>([]);
  const [practiceName, setPracticeName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    getCase(id)
      .then((res) => {
        setCaseRecord(res.case);
        setCurrentStage(res.currentStage);
        setAudit(res.recentStatusAudit);
        return getPractice(res.case.practice_id).catch(() => null);
      })
      .then((practiceRes) => {
        if (practiceRes) setPracticeName(practiceRes.practice.practice_name);
      })
      .catch((err) => {
        // Tenant isolation returns 403 (not 404) for a cross-tenant hit —
        // surface both distinctly rather than a generic error, per the
        // backend's own documented "403, not 404-vs-200 leak" behavior.
        if (err instanceof ApiError && err.status === 404) {
          setError('This case does not exist.');
        } else if (err instanceof ApiError && err.status === 403) {
          setError("You don't have access to this case.");
        } else {
          setError(err instanceof ApiError ? err.message : 'Could not load this case.');
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-8 w-64 rounded-lg" />
        <div className="skeleton h-40 rounded-2xl" />
        <div className="skeleton h-40 rounded-2xl" />
      </div>
    );
  }

  if (error || !caseRecord) {
    return (
      <div className="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5v6" />
          <circle cx="12" cy="16.5" r="0.6" fill="currentColor" stroke="none" />
        </svg>
        <h4>{error || 'Case not found.'}</h4>
        <button onClick={() => navigate('/cases')}>Back to case queue</button>
      </div>
    );
  }

  const priorityColor = PRIORITY_COLORS[caseRecord.priority];

  return (
    <div>
      <button
        onClick={() => navigate('/cases')}
        className="text-[13px] font-semibold text-hero-teal mb-4 flex items-center gap-1 hover:underline"
      >
        ← Back to case queue
      </button>

      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <h2 className="font-display text-lg font-bold text-ink">
              {caseRecord.patient_name || 'Unnamed patient'}
            </h2>
            <StatusPill status={caseRecord.current_status} />
          </div>
          <p className="text-sm text-ink-soft font-mono">{caseRecord.case_number}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <div className="surface-card rounded-[18px] p-5">
          <h3 className="font-display text-[15px] font-bold text-ink mb-3.5">Case details</h3>
          <div className="grid grid-cols-2 gap-3">
            <DetailCell label="Practice" value={practiceName ?? `Practice #${caseRecord.practice_id}`} />
            <DetailCell
              label="Priority"
              value={
                <span
                  className="status-pill"
                  style={{ background: priorityColor.bg, color: priorityColor.text }}
                >
                  {caseRecord.priority}
                </span>
              }
            />
            <DetailCell label="Due date" value={caseRecord.due_date} />
            <DetailCell label="Dentist ID" value={`#${caseRecord.dentist_id}`} />
            <DetailCell label="Patient ref. ID" value={caseRecord.patient_reference_id || '—'} />
            <DetailCell
              label="Assigned staff"
              value={caseRecord.assigned_staff_id ? `#${caseRecord.assigned_staff_id}` : 'Unassigned'}
            />
          </div>
          {caseRecord.rx_instructions && (
            <div className="mt-3.5 bg-page-bg-top rounded-[10px] p-3">
              <span className="block text-[10.5px] uppercase tracking-wider text-ink-soft mb-1">
                Rx instructions
              </span>
              <p className="text-[13px] text-ink m-0">{caseRecord.rx_instructions}</p>
            </div>
          )}
          {caseRecord.notes && (
            <div className="mt-2.5 bg-page-bg-top rounded-[10px] p-3">
              <span className="block text-[10.5px] uppercase tracking-wider text-ink-soft mb-1">
                Notes
              </span>
              <p className="text-[13px] text-ink m-0">{caseRecord.notes}</p>
            </div>
          )}
        </div>

        <div className="surface-card rounded-[18px] p-5">
          <h3 className="font-display text-[15px] font-bold text-ink mb-1">Current stage</h3>
          {currentStage ? (
            <>
              <p className="text-sm text-ink-soft mb-3.5">{currentStage.status}</p>
              <div className="grid grid-cols-2 gap-3 mb-3.5">
                <DetailCell label="Stage" value={currentStage.stage_name} />
                <DetailCell
                  label="Started"
                  value={new Date(currentStage.started_at).toLocaleDateString()}
                />
              </div>
              {currentStage.notes && (
                <div className="bg-page-bg-top rounded-[10px] p-3">
                  <span className="block text-[10.5px] uppercase tracking-wider text-ink-soft mb-1">
                    Stage notes
                  </span>
                  <p className="text-[13px] text-ink m-0">{currentStage.notes}</p>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-ink-soft">No stage history yet.</p>
          )}

          <h3 className="font-display text-[15px] font-bold text-ink mt-5 mb-3">
            Recent status changes
          </h3>
          {audit.length === 0 ? (
            <p className="text-sm text-ink-soft">No status changes recorded yet.</p>
          ) : (
            <div className="space-y-2.5">
              {audit.map((a) => (
                <div key={a.id} className="flex items-start justify-between text-[12.5px] border-b border-border pb-2.5 last:border-0">
                  <div>
                    <span className="font-semibold text-ink">
                      {a.old_status ? `${a.old_status} → ` : ''}
                      {a.new_status}
                    </span>
                    <div className="text-ink-soft mt-0.5">
                      {a.changed_by_name}
                      {a.remarks ? ` — ${a.remarks}` : ''}
                    </div>
                  </div>
                  <span className="font-mono text-ink-soft shrink-0 ml-3">
                    {new Date(a.changed_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-page-bg-top rounded-[10px] px-3 py-2.5">
      <span className="block text-[10.5px] uppercase tracking-wider text-ink-soft mb-0.5">{label}</span>
      <b className="text-[13.5px] font-bold text-ink">{value}</b>
    </div>
  );
}
