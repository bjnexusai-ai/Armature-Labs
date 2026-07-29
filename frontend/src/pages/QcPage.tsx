import { useCallback, useEffect, useState } from 'react';
import { ApiError, listChecklists, resolveRework } from '../lib/api';
import type { QcChecklist } from '../lib/caseTypes';
import { useToast } from '../context/ToastContext';
import { NewChecklistModal } from '../components/NewChecklistModal';

// Entire QC router is requireInternal server-side (qc.routes.js) — no
// portal/dentist_client access at all. This page is only reachable by
// internal roles anyway (navConfig gates the nav item the same way), but
// there's no per-action permission split within "internal" the way billing
// has Owner/Office Manager vs everyone else, so nothing here is further
// gated beyond "not a portal user."
export function QcPage() {
  const { showToast } = useToast();

  const [checklists, setChecklists] = useState<QcChecklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newChecklistOpen, setNewChecklistOpen] = useState(false);

  const [reworkId, setReworkId] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    listChecklists()
      .then((res) => setChecklists(res.checklists))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Could not load QC checklists.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // PATCH /api/qc/rework/:id/resolve — not case-scoped, operates directly on
  // a rework record by its own id (confirmed against qc.controller.js /
  // qc.routes.js). There's no list-rework-records endpoint mounted on this
  // router this session, so resolution is by known id rather than a picker.
  async function handleResolveRework(e: React.FormEvent) {
    e.preventDefault();
    setResolveError(null);
    const id = Number(reworkId);
    if (!id || id <= 0) {
      setResolveError('Enter a valid rework record ID.');
      return;
    }
    setResolving(true);
    try {
      const res = await resolveRework(id, { resolutionNotes: resolutionNotes || undefined });
      showToast(`Rework #${res.rework.id} resolved`);
      setReworkId('');
      setResolutionNotes('');
    } catch (err) {
      setResolveError(err instanceof ApiError ? err.message : 'Could not resolve that rework record.');
    } finally {
      setResolving(false);
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="text-sm text-ink-soft">Checklists used for case QC, and rework resolution.</p>
        </div>
        <button
          onClick={() => setNewChecklistOpen(true)}
          className="px-4 py-2.5 rounded-[10px] text-white text-body-sm font-semibold"
          style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
        >
          + New checklist
        </button>
      </div>

      <div className="surface-card rounded-[18px] p-5 mb-5">
        <h3 className="font-display text-body-lg font-bold text-ink mb-3">Checklists</h3>

        {error && (
          <div className="text-body-sm text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5 mb-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-11 rounded-lg" />
            ))}
          </div>
        ) : checklists.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="4.5" y="3.5" width="15" height="17" rx="2" />
              <path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" />
            </svg>
            <h4>No checklists yet</h4>
            <p>Create your first QC checklist to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {checklists.map((cl) => (
              <div key={cl.id} className="rounded-xl border border-border p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-body-lg font-semibold text-ink">{cl.name}</h4>
                  <span className="text-caption font-mono uppercase tracking-wide text-ink-soft bg-page-bg-top rounded px-1.5 py-0.5">
                    {cl.case_type_id ? `Case type #${cl.case_type_id}` : 'All case types'}
                  </span>
                </div>
                <ol className="list-decimal list-inside space-y-1">
                  {cl.items.map((item) => (
                    <li key={item.id} className="text-body-sm text-ink-soft">
                      {item.item_text}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="surface-card rounded-[18px] p-5">
        <h3 className="font-display text-body-lg font-bold text-ink mb-1">Resolve rework</h3>
        <p className="text-body-sm text-ink-soft mb-3">
          Resolves a rework record directly by its id — this isn't case-scoped, so enter the rework
          record's own ID (shown wherever rework was flagged for a case).
        </p>

        {resolveError && (
          <div className="text-body-sm text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5 mb-4">
            {resolveError}
          </div>
        )}

        <form onSubmit={handleResolveRework} className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="block text-body-sm font-semibold text-ink mb-1.5">Rework ID</label>
            <input
              className="form-input w-32"
              type="number"
              min={1}
              value={reworkId}
              onChange={(e) => setReworkId(e.target.value)}
              required
            />
          </div>
          <div className="flex-1 min-w-[220px]">
            <label className="block text-body-sm font-semibold text-ink mb-1.5">
              Resolution notes <span className="text-ink-soft font-normal">(optional)</span>
            </label>
            <input
              className="form-input"
              type="text"
              placeholder="What was done to resolve it"
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={resolving}
            className="h-10 px-4 rounded-[10px] text-white font-semibold text-body-sm cursor-pointer disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
          >
            {resolving ? 'Resolving…' : 'Resolve'}
          </button>
        </form>
      </div>

      <NewChecklistModal open={newChecklistOpen} onClose={() => setNewChecklistOpen(false)} onCreated={load} />
    </div>
  );
}
