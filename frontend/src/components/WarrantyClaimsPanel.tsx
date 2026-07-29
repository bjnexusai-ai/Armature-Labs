import { useEffect, useState } from 'react';
import { ApiError, createWarrantyClaim, listWarrantyClaims } from '../lib/api';
import type { CaseStatus, WarrantyClaim } from '../lib/caseTypes';
import { WarrantyStatusPill } from './WarrantyStatusPill';
import { WarrantyClaimResolveModal } from './WarrantyClaimResolveModal';
import { useToast } from '../context/ToastContext';

// Warranty Claims (Frontend Session 5) — confirmed directly against
// backend/src/controllers/fulfillment.controller.js. Filing is open to
// staff OR the owning dentist_client, but the backend 409s unless the case
// is already "Delivered" — the "File a claim" button below mirrors that
// check client-side (cosmetic only; the 409 is the real enforcement) so
// non-Delivered cases don't show a button that would just error.
// Resolving is internal-only.
export function WarrantyClaimsPanel({
  caseId,
  caseStatus,
  isInternal,
}: {
  caseId: number;
  caseStatus: CaseStatus;
  isInternal: boolean;
}) {
  const { showToast } = useToast();
  const [claims, setClaims] = useState<WarrantyClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filing, setFiling] = useState(false);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resolvingClaim, setResolvingClaim] = useState<WarrantyClaim | null>(null);

  const canFile = caseStatus === 'Delivered';

  function load() {
    setLoading(true);
    setError(null);
    listWarrantyClaims(caseId)
      .then((res) => setClaims(res.warrantyClaims))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load warranty claims.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, [caseId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await createWarrantyClaim(caseId, { description: description.trim() });
      setDescription('');
      setFiling(false);
      showToast('Warranty claim filed');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not file that claim.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3.5">
        <span className="text-body-sm text-ink-soft">
          {canFile
            ? 'Either the lab or the dental office can file a claim once a case has been delivered.'
            : 'A warranty claim can only be filed once this case reaches "Delivered" status.'}
        </span>
        {canFile && (
          <button
            onClick={() => setFiling((f) => !f)}
            className="btn-primary h-9 px-4 rounded-[10px] font-semibold text-body-sm shrink-0 ml-3"
          >
            {filing ? 'Cancel' : '+ File a claim'}
          </button>
        )}
      </div>

      {filing && canFile && (
        <form onSubmit={handleSubmit} className="surface-card rounded-[18px] p-4 mb-4">
          <label className="block text-body-sm font-semibold text-ink mb-1.5">What's the issue?</label>
          <textarea
            className="form-input h-24 resize-none py-2 mb-3"
            placeholder="Describe the fit, shade, or damage issue…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
          <button
            type="submit"
            disabled={submitting || !description.trim()}
            className="h-9 px-4 rounded-[10px] text-white font-semibold text-body-sm disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
          >
            {submitting ? 'Filing…' : 'File claim'}
          </button>
        </form>
      )}

      {error && (
        <div className="text-body-sm text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5 mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2.5">
          <div className="skeleton h-24 rounded-[14px]" />
        </div>
      ) : claims.length === 0 ? (
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5v5.5l3.5 2" />
          </svg>
          <h4>No warranty claims</h4>
          <p>Nothing filed for this case yet.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {claims.map((c) => (
            <div key={c.id} className="surface-card rounded-[14px] p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-body-sm font-semibold text-ink">Claim #{c.id}</span>
                  <WarrantyStatusPill status={c.status} />
                </div>
                {isInternal && !c.resolved_at && (
                  <button
                    onClick={() => setResolvingClaim(c)}
                    className="h-8 px-3 rounded-[10px] border border-border bg-white font-semibold text-caption cursor-pointer hover:bg-page-bg-top shrink-0"
                  >
                    Resolve
                  </button>
                )}
              </div>
              <p className="text-body-sm text-ink m-0 mb-2">{c.description}</p>
              {c.resolution_notes && (
                <div className="bg-page-bg-top rounded-[10px] p-3">
                  <span className="block text-caption uppercase tracking-wider text-ink-soft mb-1">
                    Resolution notes
                  </span>
                  <p className="text-body-sm text-ink m-0">{c.resolution_notes}</p>
                </div>
              )}
              <div className="text-caption text-ink-soft mt-2 space-x-3">
                <span>Filed {new Date(c.created_at).toLocaleDateString()}</span>
                {c.resolved_at && <span>Resolved {new Date(c.resolved_at).toLocaleDateString()}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {isInternal && (
        <WarrantyClaimResolveModal claim={resolvingClaim} onClose={() => setResolvingClaim(null)} onResolved={load} />
      )}
    </div>
  );
}
