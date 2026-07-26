import { useEffect, useState } from 'react';
import { ApiError, resolveWarrantyClaim } from '../lib/api';
import type { WarrantyClaim, WarrantyClaimStatus } from '../lib/caseTypes';
import { useToast } from '../context/ToastContext';

const RESOLVE_STATUS_OPTIONS: Exclude<WarrantyClaimStatus, 'Open'>[] = ['Under Review', 'Approved', 'Denied', 'Resolved'];

interface WarrantyClaimResolveModalProps {
  claim: WarrantyClaim | null;
  onClose: () => void;
  onResolved: () => void;
}

// Confirmed against resolveWarrantyClaimSchema in fulfillment.controller.js
// — status (enum, excludes 'Open' — a claim only ever moves forward),
// resolutionNotes optional. Once resolved_at is set (Approved/Denied/
// Resolved), the backend 409s any further attempt — this modal doesn't
// pre-empt that client-side, the server's error message surfaces as-is.
export function WarrantyClaimResolveModal({ claim, onClose, onResolved }: WarrantyClaimResolveModalProps) {
  const { showToast } = useToast();
  const [status, setStatus] = useState<Exclude<WarrantyClaimStatus, 'Open'>>('Under Review');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = claim != null;

  useEffect(() => {
    if (claim) {
      setStatus(claim.status === 'Open' ? 'Under Review' : (claim.status as Exclude<WarrantyClaimStatus, 'Open'>));
      setResolutionNotes(claim.resolution_notes || '');
      setError(null);
    }
  }, [claim]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!claim) return;
    setSubmitting(true);
    setError(null);
    try {
      await resolveWarrantyClaim(claim.id, { status, resolutionNotes: resolutionNotes.trim() || undefined });
      showToast('Warranty claim updated');
      onResolved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update this claim.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className={`modal-overlay ${open ? 'open' : ''}`}
      aria-hidden={!open}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {claim && (
        <div className="modal-box w-full max-w-[440px] bg-card-bg rounded-[20px] p-[26px_26px_22px] shadow-[0_30px_70px_rgba(10,30,30,0.28)] max-h-[86vh] overflow-y-auto">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="font-display text-[17px] font-bold text-ink m-0">Resolve warranty claim</h3>
              <p className="text-xs text-ink-soft mt-0.5 font-mono">Claim #{claim.id}</p>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg bg-page-bg-top border-0 cursor-pointer flex items-center justify-center shrink-0 hover:bg-border"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="bg-page-bg-top rounded-[10px] p-3 mb-4">
            <span className="block text-[10.5px] uppercase tracking-wider text-ink-soft mb-1">Description</span>
            <p className="text-[13px] text-ink m-0">{claim.description}</p>
          </div>

          {error && (
            <div className="text-[12.5px] text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5 mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="mb-3.5">
              <label className="block text-[12.5px] font-semibold text-ink mb-1.5">Status</label>
              <select
                className="form-input"
                value={status}
                onChange={(e) => setStatus(e.target.value as Exclude<WarrantyClaimStatus, 'Open'>)}
              >
                {RESOLVE_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-3.5">
              <label className="block text-[12.5px] font-semibold text-ink mb-1.5">
                Resolution notes <span className="text-ink-soft font-normal">(optional)</span>
              </label>
              <textarea
                className="form-input h-24 resize-none py-2"
                placeholder="What's the outcome, and why?"
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                maxLength={2000}
              />
            </div>

            <div className="flex gap-2.5 mt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-10 rounded-[9px] border border-border bg-white font-semibold text-[13px] cursor-pointer hover:bg-page-bg-top"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 h-10 rounded-[9px] text-white font-semibold text-[13px] cursor-pointer disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
              >
                {submitting ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
