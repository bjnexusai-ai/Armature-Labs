import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, listApprovals } from '../lib/api';
import type { ApprovalRecord, ApprovalStatus, Pagination } from '../lib/caseTypes';
import { useAuth } from '../context/AuthContext';
import { ApprovalStatusPill } from '../components/ApprovalStatusPill';
import { ApprovalActionModal } from '../components/ApprovalActionModal';

const TABS: { key: ApprovalStatus | ''; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Changes requested' },
  { key: '', label: 'All' },
];

export function ApprovalsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | ''>('pending');
  const [page, setPage] = useState(1);

  const [modalTarget, setModalTarget] = useState<ApprovalRecord | null>(null);
  const [modalAction, setModalAction] = useState<'approve' | 'request-changes' | null>(null);

  // Gate is UI convenience only — the real 403 enforcement lives server-side
  // on req.user.can_approve_photos, per approvals.controller.js. This just
  // hides the buttons for roles that would get a 403 anyway.
  const canAct = Boolean(user?.canApprovePhotos);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    listApprovals({ page, limit: 25, status: statusFilter || undefined })
      .then((res) => {
        setApprovals(res.approvals);
        setPagination(res.pagination);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Could not load approvals.');
      })
      .finally(() => setLoading(false));
  }, [page, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  function openAction(approval: ApprovalRecord, action: 'approve' | 'request-changes') {
    setModalTarget(approval);
    setModalAction(action);
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="font-display text-lg font-bold text-ink mb-1">Approvals</h2>
          <p className="text-sm text-ink-soft">
            Design and bisque photos awaiting a decision before a case can move forward.
          </p>
        </div>
      </div>

      <div className="surface-card rounded-[18px] p-5">
        <div className="flex gap-2 flex-wrap mb-4">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setStatusFilter(tab.key);
                setPage(1);
              }}
              className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold border transition-colors ${
                statusFilter === tab.key
                  ? 'text-white border-transparent'
                  : 'border-border text-ink-soft hover:bg-page-bg-top'
              }`}
              style={
                statusFilter === tab.key
                  ? { background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }
                  : undefined
              }
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="text-[12.5px] text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5 mb-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton h-11 rounded-lg" />
            ))}
          </div>
        ) : approvals.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M8.5 12.3l2.3 2.3 4.7-5" />
            </svg>
            <h4>Nothing here</h4>
            <p>No {statusFilter || ''} approvals right now.</p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Case', 'Patient', 'Stage', 'Media', 'Status', ''].map((h) => (
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
              {approvals.map((a) => (
                <tr key={a.id} className="hover:bg-page-bg-top transition-colors">
                  <td
                    className="p-3 border-b border-border font-mono text-[12.5px] text-ink-soft cursor-pointer"
                    onClick={() => navigate(`/cases/${a.case_id}`)}
                  >
                    {a.case_number}
                  </td>
                  <td className="p-3 border-b border-border text-[13px]">{a.patient_name || '—'}</td>
                  <td className="p-3 border-b border-border text-[13px] capitalize">{a.stage}</td>
                  <td className="p-3 border-b border-border text-[13px]">
                    <a
                      href={a.media_file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#1C8A93] hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {a.media_file_name}
                    </a>
                  </td>
                  <td className="p-3 border-b border-border">
                    <ApprovalStatusPill status={a.status} />
                  </td>
                  <td className="p-3 border-b border-border text-right whitespace-nowrap">
                    {a.status === 'pending' && canAct && (
                      <div className="flex gap-1.5 justify-end">
                        <button
                          onClick={() => openAction(a, 'request-changes')}
                          className="px-2.5 py-1.5 rounded-md border border-border text-xs font-semibold hover:bg-page-bg-top"
                        >
                          Request changes
                        </button>
                        <button
                          onClick={() => openAction(a, 'approve')}
                          className="px-2.5 py-1.5 rounded-md text-white text-xs font-semibold"
                          style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
                        >
                          Approve
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
            <span className="text-xs text-ink-soft">
              Page {pagination.page} of {pagination.totalPages} · {pagination.total} approvals
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

      <ApprovalActionModal
        approval={modalTarget}
        action={modalAction}
        onClose={() => {
          setModalTarget(null);
          setModalAction(null);
        }}
        onDone={load}
      />
    </div>
  );
}
