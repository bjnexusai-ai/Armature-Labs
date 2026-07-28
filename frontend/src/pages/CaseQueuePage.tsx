import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, listCases, listPractices } from '../lib/api';
import type { CaseRecord, CaseStatus, Pagination, Practice } from '../lib/caseTypes';
import { ALL_STATUSES } from '../lib/caseTypes';
import { StatusPill } from '../components/StatusPill';
import { NewCaseModal } from '../components/NewCaseModal';
import { parseFlexibleDate } from '../lib/dateUtils';

export function CaseQueuePage() {
  const navigate = useNavigate();

  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [practices, setPractices] = useState<Practice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<CaseStatus | ''>('');
  const [search, setSearch] = useState('');
  const [newCaseOpen, setNewCaseOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    listCases({ page, limit: 25, status: statusFilter || undefined })
      .then((res) => {
        setCases(res.cases);
        setPagination(res.pagination);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Could not load cases.');
      })
      .finally(() => setLoading(false));
  }, [page, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // Practices only need to be fetched once, for the practice-name lookup —
  // cases only carry practice_id, per the confirmed CASE_SELECT_FIELDS shape.
  useEffect(() => {
    listPractices()
      .then((res) => setPractices(res.practices))
      .catch(() => {
        /* Non-fatal — the table falls back to showing the raw practice ID. */
      });
  }, []);

  const practiceName = (id: number) =>
    practices.find((p) => p.id === id)?.practice_name ?? `Practice #${id}`;

  // Free-text search: no backend param exists for this (confirmed in the
  // Wiring Prompt / Master Frontend Plan §5) — client-side filtering over
  // the current page only, by design, not a bug.
  const q = search.trim().toLowerCase();
  const visibleCases = q
    ? cases.filter((c) => {
        const haystack = [c.case_number, c.patient_name ?? '', practiceName(c.practice_id)]
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      })
    : cases;

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="font-display text-lg font-bold text-ink mb-1">Case Queue</h2>
          <p className="text-sm text-ink-soft">All cases across every stage of production.</p>
        </div>
        <button
          onClick={() => setNewCaseOpen(true)}
          className="shrink-0 rounded-lg text-white font-semibold text-sm px-4.5 py-2.5 transition-transform hover:-translate-y-0.5"
          style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
        >
          + New Case
        </button>
      </div>

      <div className="surface-card rounded-[18px] p-5">
        <div className="flex gap-2.5 flex-wrap mb-4">
          <input
            className="form-input flex-1 min-w-[180px] h-10"
            type="text"
            placeholder="Search by case ID, patient, or practice…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="form-input h-10 w-auto"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as CaseStatus | '');
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="text-[12.5px] text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5 mb-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-11 rounded-lg" />
            ))}
          </div>
        ) : visibleCases.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <h4>No cases match your filters</h4>
            <p>Try a different search term or status.</p>
            <button
              onClick={() => {
                setSearch('');
                setStatusFilter('');
              }}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Case', 'Patient', 'Practice', 'Priority', 'Status', 'Due'].map((h) => (
                  <th
                    key={h}
                    className="text-left text-[11px] uppercase tracking-wider text-ink-soft pb-2.5 border-b border-border"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleCases.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/cases/${c.id}`)}
                  className="cursor-pointer hover:bg-page-bg-top transition-colors"
                >
                  <td className="p-3 border-b border-border font-mono text-[12.5px] text-ink-soft">
                    {c.case_number}
                  </td>
                  <td className="p-3 border-b border-border text-[13px]">
                    {c.patient_name || '—'}
                  </td>
                  <td className="p-3 border-b border-border text-[13px]">
                    {practiceName(c.practice_id)}
                  </td>
                  <td className="p-3 border-b border-border text-[13px]">{c.priority}</td>
                  <td className="p-3 border-b border-border">
                    <StatusPill status={c.current_status} />
                  </td>
                  <td className="p-3 border-b border-border text-[13px]">
                    {parseFlexibleDate(c.due_date)?.toLocaleDateString() ?? c.due_date}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
            <span className="text-xs text-ink-soft">
              Page {pagination.page} of {pagination.totalPages} · {pagination.total} cases
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-md border border-border text-xs font-semibold disabled:opacity-40 hover:bg-page-bg-top"
              >
                Previous
              </button>
              <button
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-md border border-border text-xs font-semibold disabled:opacity-40 hover:bg-page-bg-top"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <NewCaseModal
        open={newCaseOpen}
        onClose={() => setNewCaseOpen(false)}
        onCreated={load}
      />
    </div>
  );
}
