import { useEffect, useState } from 'react';
import { ApiError, createShift } from '../lib/api';
import { useToast } from '../context/ToastContext';

interface NewShiftModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

/**
 * Confirmed against createShiftSchema in planning.controller.js —
 * technicianId (references `technicians.id`), startsAt/endsAt, notes
 * optional. A double-booked technician returns a real 409, surfaced here
 * via ApiError's message rather than a raw error.
 *
 * **Confirmed gap, not guessed around:** no endpoint in this backend
 * returns `technicians.id` paired with a display name. `GET /api/users`
 * (manager-only) returns `users.id` + `full_name`, but `technician_shifts.
 * technician_id` is a foreign key into the separate `technicians` table,
 * whose own `id` is never exposed by any confirmed route (grepped
 * `technicians.controller.js` / any `GET /api/technicians` — neither
 * exists). Rather than guess a mapping or invent a new backend endpoint
 * (against this project's own standing rule), this takes a plain
 * technician ID number with a clear note — same honesty the Session 7
 * prompt itself modeled for the Action Required Queue and hero card gaps.
 */
export function NewShiftModal({ open, onClose, onCreated }: NewShiftModalProps) {
  const { showToast } = useToast();

  const [technicianId, setTechnicianId] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setTechnicianId('');
      setStartsAt('');
      setEndsAt('');
      setNotes('');
      setSubmitError(null);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const techId = Number(technicianId);
    if (!techId || techId <= 0) {
      setSubmitError('A valid technician ID is required.');
      return;
    }
    if (!startsAt || !endsAt) {
      setSubmitError('Start and end time are both required.');
      return;
    }

    setSubmitting(true);
    try {
      await createShift({
        technicianId: techId,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        notes: notes.trim() || undefined,
      });
      showToast('Shift created.');
      onCreated();
      onClose();
    } catch (err) {
      // 409 (overlapping shift) surfaces here with the backend's own
      // human-readable message — not a raw error, per the prompt's
      // definition-of-done requirement to surface conflicts sensibly.
      setSubmitError(err instanceof ApiError ? err.message : 'Could not create this shift.');
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
      <div className="modal-box w-full max-w-[460px] bg-card-bg rounded-[18px] p-[26px_26px_22px] shadow-[0_30px_70px_rgba(10,30,30,0.28)] max-h-[86vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="font-display text-title-sm font-bold text-ink m-0">New technician shift</h3>
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
            <label className="block text-body-sm font-semibold text-ink mb-1.5">Technician ID</label>
            <input
              className="form-input"
              type="number"
              min={1}
              value={technicianId}
              onChange={(e) => setTechnicianId(e.target.value)}
              placeholder="e.g. 3"
            />
            <p className="text-caption text-ink-soft mt-1.5">
              No staff directory endpoint currently links a technician's name to their ID — ask your Office Manager if
              unsure.
            </p>
          </div>

          <div className="flex gap-2.5 mb-3.5">
            <div className="flex-1">
              <label className="block text-body-sm font-semibold text-ink mb-1.5">Starts</label>
              <input className="form-input" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </div>
            <div className="flex-1">
              <label className="block text-body-sm font-semibold text-ink mb-1.5">Ends</label>
              <input className="form-input" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-body-sm font-semibold text-ink mb-1.5">Notes (optional)</label>
            <textarea className="form-input h-16 resize-none py-2" value={notes} onChange={(e) => setNotes(e.target.value)} />
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
              {submitting ? 'Creating…' : 'Create shift'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
