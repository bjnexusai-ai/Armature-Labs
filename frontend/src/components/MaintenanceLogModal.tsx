import { useEffect, useState } from 'react';
import { ApiError, createMaintenanceLog } from '../lib/api';
import type { Equipment, MaintenanceLogType } from '../lib/equipmentTypes';
import { useToast } from '../context/ToastContext';

interface MaintenanceLogModalProps {
  open: boolean;
  equipment: Equipment | null;
  onClose: () => void;
  onLogged: () => void;
}

const LOG_TYPES: MaintenanceLogType[] = ['Routine', 'Repair', 'Inspection'];

/**
 * Confirmed against createMaintenanceLogSchema in equipment.controller.js
 * — logType required, nextDueDate + notes optional. Open to any internal
 * staff (not manager-gated), matching the route comment's own reasoning:
 * a technician servicing a machine shouldn't need a manager to log it.
 * `nextDueDate` is intentionally optional here, not defaulted to today —
 * the controller only overwrites `equipment.next_maintenance_due_date`
 * when one is actually supplied (its own documented bugfix), so leaving
 * this blank correctly leaves an existing future due date untouched.
 */
export function MaintenanceLogModal({ open, equipment, onClose, onLogged }: MaintenanceLogModalProps) {
  const { showToast } = useToast();

  const [logType, setLogType] = useState<MaintenanceLogType>('Routine');
  const [nextDueDate, setNextDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setLogType('Routine');
      setNextDueDate('');
      setNotes('');
      setSubmitError(null);
    }
  }, [open]);

  if (!equipment) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      await createMaintenanceLog(equipment!.id, {
        logType,
        nextDueDate: nextDueDate || undefined,
        notes: notes.trim() || undefined,
      });
      showToast('Maintenance log recorded.');
      onLogged();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not record this log.');
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
      <div className="modal-box w-full max-w-[460px] bg-card-bg rounded-[20px] p-[26px_26px_22px] shadow-[0_30px_70px_rgba(10,30,30,0.28)] max-h-[86vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="font-display text-[17px] font-bold text-ink m-0">Log maintenance</h3>
            <p className="text-xs text-ink-soft mt-0.5">{equipment.name}</p>
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
          <div className="text-[12.5px] text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5 mb-4">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="range-toggle mb-4">
            {LOG_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                className={`range-btn ${logType === t ? 'active' : ''}`}
                onClick={() => setLogType(t)}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="mb-3.5">
            <label className="block text-[12.5px] font-semibold text-ink mb-1.5">Next due date (optional)</label>
            <input className="form-input" type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} />
            <p className="text-[11px] text-ink-soft mt-1.5">Leave blank to keep this machine's existing due date unchanged.</p>
          </div>

          <div className="mb-4">
            <label className="block text-[12.5px] font-semibold text-ink mb-1.5">Notes (optional)</label>
            <textarea className="form-input h-16 resize-none py-2" value={notes} onChange={(e) => setNotes(e.target.value)} />
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
              {submitting ? 'Recording…' : 'Record log'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
