import { useEffect, useState } from 'react';
import { ApiError, approveApproval, requestChangesApproval } from '../lib/api';
import type { ApprovalRecord } from '../lib/caseTypes';
import { useToast } from '../context/ToastContext';

interface ApprovalActionModalProps {
  approval: ApprovalRecord | null;
  action: 'approve' | 'request-changes' | null;
  onClose: () => void;
  onDone: () => void;
}

// comments is optional on approve, required (min 1 char) on request-changes
// — confirmed against approveSchema / requestChangesSchema in
// approvals.controller.js. Same modal handles both since the form shape
// is otherwise identical, per NewCaseModal's single-form precedent.
export function ApprovalActionModal({ approval, action, onClose, onDone }: ApprovalActionModalProps) {
  const { showToast } = useToast();
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = approval != null && action != null;
  const isRequestChanges = action === 'request-changes';

  useEffect(() => {
    if (!open) {
      setComments('');
      setError(null);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!approval || !action) return;

    if (isRequestChanges && !comments.trim()) {
      setError('Comments are required when requesting changes.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (isRequestChanges) {
        await requestChangesApproval(approval.id, { comments: comments.trim() });
        showToast('Changes requested');
      } else {
        await approveApproval(approval.id, { comments: comments.trim() || undefined });
        showToast('Approved');
      }
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit your response.');
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
      {approval && action && (
        <div className="modal-box w-full max-w-[440px] bg-card-bg rounded-[18px] p-[26px_26px_22px] shadow-[0_30px_70px_rgba(10,30,30,0.28)] max-h-[86vh] overflow-y-auto">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="font-display text-title-sm font-bold text-ink m-0">
                {isRequestChanges ? 'Request changes' : 'Approve'}
              </h3>
              <p className="text-xs text-ink-soft mt-0.5 font-mono">
                {approval.case_number} · {approval.stage === 'design' ? 'Design' : 'Bisque'} stage
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg bg-page-bg-top border-0 cursor-pointer flex items-center justify-center shrink-0 hover:bg-border"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="rounded-xl overflow-hidden mb-4 bg-page-bg-top">
            <img
              src={approval.media_file_url}
              alt={approval.media_file_name}
              className="w-full max-h-[220px] object-contain"
            />
          </div>

          {error && (
            <div className="text-body-sm text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5 mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="mb-3.5">
              <label className="block text-body-sm font-semibold text-ink mb-1.5">
                {isRequestChanges ? 'What needs to change?' : 'Comments'}
                {!isRequestChanges && <span className="text-ink-soft font-normal"> (optional)</span>}
              </label>
              <textarea
                className="form-input h-24 resize-none py-2"
                placeholder={isRequestChanges ? 'Required — describe the requested changes' : 'optional'}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                required={isRequestChanges}
                maxLength={2000}
              />
            </div>

            <div className="flex gap-2.5 mt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-10 rounded-[10px] border border-border bg-white font-semibold text-body-sm cursor-pointer hover:bg-page-bg-top"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 h-10 rounded-[10px] text-white font-semibold text-body-sm cursor-pointer disabled:opacity-60"
                style={{
                  background: isRequestChanges
                    ? 'linear-gradient(135deg,#C1543A,#9C4326)'
                    : 'linear-gradient(135deg,#1C8A93,#16A37A)',
                }}
              >
                {submitting ? 'Submitting…' : isRequestChanges ? 'Request changes' : 'Approve'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
