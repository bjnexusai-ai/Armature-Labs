import { useEffect, useState } from 'react';
import { ApiError, createSavedReport } from '../lib/api';
import { REPORT_TYPES, type ReportType } from '../lib/reportTypes';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { isManagerRole } from '../lib/permissions';

interface SavedReportModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

/**
 * Create-only per reports.controller.js's real verbs (create/list/delete —
 * no update endpoint exists, confirmed against reports.routes.js). This is
 * a filter *preset*, not a report generator — saving one does not run
 * anything against live data, matching the Master Frontend Plan's explicit
 * "confirm saved_reports are views, not separate storage" instruction.
 */
export function SavedReportModal({ open, onClose, onCreated }: SavedReportModalProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const canUseRevenue = isManagerRole(user);
  const availableTypes = REPORT_TYPES.filter((t) => t !== 'Revenue' || canUseRevenue);

  const [name, setName] = useState('');
  const [reportType, setReportType] = useState<ReportType>(availableTypes[0]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setName('');
      setReportType(availableTypes[0]);
      setSubmitError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!name.trim()) {
      setSubmitError('A name is required.');
      return;
    }
    setSubmitting(true);
    try {
      await createSavedReport({ name: name.trim(), reportType, filters: {} });
      showToast('Saved report created.');
      onCreated();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not save this report.');
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
      <div className="modal-box w-full max-w-[440px] bg-card-bg rounded-[18px] p-[26px_26px_22px] shadow-[0_30px_70px_rgba(10,30,30,0.28)] max-h-[86vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="font-display text-title-sm font-bold text-ink m-0">New saved report</h3>
            <p className="text-xs text-ink-soft mt-0.5">A reusable name + report type preset.</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-page-bg-top border-0 cursor-pointer flex items-center justify-center shrink-0 hover:bg-border"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {submitError && (
          <div className="text-body-sm text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5 mb-4">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-3.5">
            <label className="block text-body-sm font-semibold text-ink mb-1.5">Name</label>
            <input
              className="form-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Weekly turnaround check"
              autoFocus
            />
          </div>

          <div className="mb-4">
            <label className="block text-body-sm font-semibold text-ink mb-1.5">Report type</label>
            <select
              className="form-input"
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ReportType)}
            >
              {availableTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            {!canUseRevenue && (
              <p className="text-caption text-ink-soft mt-1.5">
                Revenue reports are restricted to Owner and Office Manager.
              </p>
            )}
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
              style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
