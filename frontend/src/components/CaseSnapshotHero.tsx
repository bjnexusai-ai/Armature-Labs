import { useNavigate } from 'react-router';
import type { CaseRecord } from '../lib/caseTypes';
import { stagePercent } from '../lib/dashboardMetrics';
import { parseFlexibleDate } from '../lib/dateUtils';

interface CaseSnapshotHeroProps {
  caseRecord: CaseRecord | null;
  caseTypeName: string | null;
  loading?: boolean;
}

/**
 * Session 7 §0.2 retrofit — hero "Case Snapshot" card ported from the
 * reference demo pixel-for-pixel (teal gradient, floating tooth mark,
 * mesh rings), but wired to a real case instead of hardcoded copy.
 *
 * The reference shows a "Material" field — there's no material/case
 * link in the real schema (materials belong to inventory, not cases;
 * confirmed via backend/migrations, no `material_id` on `cases`), so
 * this substitutes the case type name instead of inventing a fake
 * material value. Documented decision, not a silent guess.
 *
 * The tooth SVG mark is copied from LoginPage.tsx's existing tooth path
 * (same stroke-icon convention already established there) rather than
 * a new asset, per the Session 7 prompt's explicit instruction to reuse
 * it if possible.
 */
export function CaseSnapshotHero({ caseRecord, caseTypeName, loading }: CaseSnapshotHeroProps) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div
        className="fade-in rounded-[18px] p-6 mb-5 flex items-center gap-7"
        style={{ background: 'linear-gradient(135deg,#0D6B72,#0C6249)' }}
      >
        <div className="skeleton w-[88px] h-[88px] rounded-2xl shrink-0" style={{ background: 'rgba(255,255,255,0.18)' }} />
        <div className="flex-1">
          <div className="skeleton h-3 w-40 rounded mb-3" style={{ background: 'rgba(255,255,255,0.18)' }} />
          <div className="skeleton h-5 w-64 rounded mb-4" style={{ background: 'rgba(255,255,255,0.18)' }} />
          <div className="skeleton h-4 w-full max-w-md rounded" style={{ background: 'rgba(255,255,255,0.18)' }} />
        </div>
      </div>
    );
  }

  if (!caseRecord) {
    return (
      <div className="surface-card fade-in rounded-[18px] p-6 mb-5 text-center text-ink-soft text-sm">
        No in-progress cases right now — every case is either Delivered or the queue is empty.
      </div>
    );
  }

  const pct = stagePercent(caseRecord.current_status);
  const dueLabel = formatDueLabel(caseRecord.due_date);

  return (
    <div
      className="fade-in rounded-[18px] p-6 mb-5 flex items-center gap-7 text-white cursor-pointer transition-transform hover:-translate-y-0.5"
      style={{ background: 'linear-gradient(135deg,#0D6B72,#0C6249)' }}
      onClick={() => navigate(`/cases/${caseRecord.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') navigate(`/cases/${caseRecord.id}`);
      }}
    >
      <div className="relative shrink-0 w-[88px] h-[88px] flex items-center justify-center">
        <div className="hero-tooth-glow" style={{ width: 88, height: 88 }} />
        <div className="hero-mesh-ring" style={{ width: 100, height: 100 }} />
        <div className="hero-mesh-ring two" style={{ width: 78, height: 78 }} />
        <div
          className="hero-tooth-wrap"
          style={{ width: 88, height: 88, borderRadius: 16, background: 'rgba(255,255,255,0.1)' }}
        >
          <svg viewBox="0 0 48 48" width="40" height="40" fill="none">
            <path
              d="M24 6C16.8 6 11 11 11 17.8C11 22 12.2 25.3 13.3 29.2C14.6 33.7 16 40 18.7 40C21.2 40 21.4 32.8 22.7 29.4C23.3 27.9 24.7 27.9 25.3 29.4C26.6 32.8 26.8 40 29.3 40C32 40 33.4 33.7 34.7 29.2C35.8 25.3 37 22 37 17.8C37 11 31.2 6 24 6Z"
              fill="#fff"
              fillOpacity="0.95"
            />
            <path
              d="M11 17.8c0-1.2 5.8-2.2 13-2.2s13 1 13 2.2"
              stroke="#0C6249"
              strokeOpacity="0.5"
              strokeWidth="1.2"
              fill="none"
            />
          </svg>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs tracking-[0.06em] uppercase opacity-75 mb-1">
          Case snapshot — {caseRecord.case_number}
        </div>
        <div className="font-display font-bold text-lg mb-3.5 truncate">
          {caseTypeName ?? 'Case'}
          {caseRecord.patient_name ? ` · ${caseRecord.patient_name}` : ''}
        </div>
        <div className="flex gap-9 flex-wrap">
          <div>
            <div className="text-caption opacity-70">Stage</div>
            <div className="font-semibold text-sm">
              {caseRecord.current_status}
              {pct != null ? ` · ${pct}%` : ''}
            </div>
          </div>
          <div>
            <div className="text-caption opacity-70">Case type</div>
            <div className="font-semibold text-sm">{caseTypeName ?? '—'}</div>
          </div>
          <div>
            <div className="text-caption opacity-70">Assignment</div>
            <div className="font-semibold text-sm">{caseRecord.assigned_staff_id ? 'Assigned' : 'Unassigned'}</div>
          </div>
          <div>
            <div className="text-caption opacity-70">Due</div>
            <div className="font-semibold text-sm">{dueLabel}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDueLabel(dueDate: string): string {
  const due = parseFlexibleDate(dueDate);
  if (!due) return 'No due date';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return 'Overdue';
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
