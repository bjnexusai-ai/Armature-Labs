import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import type { ActionQueueItem } from '../lib/dashboardMetrics';
import { StatusPill } from './StatusPill';

interface ActionRequiredQueueProps {
  items: ActionQueueItem[];
  loading?: boolean;
  /** True count before any dashboard-side truncation, so a "View all" link
   * can show when this panel is a capped preview rather than the full list. */
  totalCount?: number;
}

/**
 * Session 7 §0.1 retrofit — "Action required queue" panel. This was Session
 * 3 scope (Master Frontend Plan's own instruction: "Un-hide the 'Action
 * required queue' panel that was left hardcoded/hidden in Session 0") that
 * was silently dropped — confirmed via `grep -rn "Action required"
 * frontend/src/` returning zero matches before this file existed.
 *
 * Data: cases needing staff attention = pending approvals (GET
 * /api/approvals?status=pending, the same endpoint AppShell.tsx's
 * notification bell already uses, per Session 3's log) + cases currently
 * in Delayed / Case on Hold. Built by the caller (DashboardPage) from data
 * it already fetches for the other dashboard cards — no new backend
 * endpoint invented for this, per the prompt's explicit instruction.
 */
export function ActionRequiredQueue({ items, loading, totalCount }: ActionRequiredQueueProps) {
  const [filter, setFilter] = useState('');
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.caseNumber.toLowerCase().includes(q) ||
        item.patientLabel.toLowerCase().includes(q) ||
        item.practiceLabel.toLowerCase().includes(q) ||
        item.status.toLowerCase().includes(q)
    );
  }, [items, filter]);

  return (
    <div className="surface-card fade-in rounded-[18px] p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-body-lg font-bold m-0 text-ink tracking-[-0.01em]">Action required queue</h3>
        {typeof totalCount === 'number' && totalCount > items.length && (
          <button
            onClick={() => navigate('/approvals')}
            className="text-caption font-semibold text-badge-teal hover:underline shrink-0"
          >
            View all {totalCount} →
          </button>
        )}
      </div>
      <p className="text-xs text-ink-soft mt-0.5 mb-2.5">Cases needing staff attention</p>
      <input
        type="text"
        className="form-input mb-2.5"
        style={{ height: 34, fontSize: '12.5px' }}
        placeholder="Filter this queue…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-[52px] rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state !py-8">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <h4>{items.length === 0 ? 'Nothing needs attention' : 'No matches'}</h4>
          <p>
            {items.length === 0
              ? 'No pending approvals and no delayed or on-hold cases right now.'
              : 'Try a different search term.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {filtered.map((item) => (
            <button
              key={item.key}
              onClick={() => navigate(`/cases/${item.caseId}`)}
              className="flex items-center justify-between gap-3 text-left rounded-lg px-3 py-2.5 border border-transparent hover:border-border hover:bg-page-bg-top/50 transition-colors"
              style={{ background: 'transparent' }}
            >
              <div className="min-w-0">
                <div className="text-body-sm font-semibold text-ink truncate">
                  {item.patientLabel} — {item.practiceLabel}
                </div>
                <div className="text-caption text-ink-soft font-mono">{item.caseNumber}</div>
              </div>
              <div className="shrink-0">
                <StatusPill status={item.status} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
