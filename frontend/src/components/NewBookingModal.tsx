import { useEffect, useState } from 'react';
import { ApiError, createBooking, listCases } from '../lib/api';
import type { Equipment } from '../lib/equipmentTypes';
import type { CaseRecord } from '../lib/caseTypes';
import { useToast } from '../context/ToastContext';

interface NewBookingModalProps {
  open: boolean;
  equipmentList: Equipment[];
  onClose: () => void;
  onCreated: () => void;
}

/**
 * Confirmed against createBookingSchema in planning.controller.js —
 * equipmentId required, caseId optional ("a booking can be for general/
 * non-case machine time", per migration 0032's own comment), startsAt/
 * endsAt required. Equipment picker uses the real GET /api/equipment list
 * already loaded by SchedulingPage; case picker uses a real GET /api/cases
 * page (unlike the technician-shift gap, this join is fully resolvable —
 * no reason to fall back to a raw numeric ID here).
 */
export function NewBookingModal({ open, equipmentList, onClose, onCreated }: NewBookingModalProps) {
  const { showToast } = useToast();

  const [equipmentId, setEquipmentId] = useState('');
  const [caseId, setCaseId] = useState('');
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [casesLoading, setCasesLoading] = useState(false);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setEquipmentId('');
      setCaseId('');
      setStartsAt('');
      setEndsAt('');
      setNotes('');
      setSubmitError(null);
      return;
    }
    setCasesLoading(true);
    listCases({ limit: 100 })
      .then((res) => setCases(res.cases))
      .catch(() => setCases([]))
      .finally(() => setCasesLoading(false));
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!equipmentId) {
      setSubmitError('Select which equipment this booking is for.');
      return;
    }
    if (!startsAt || !endsAt) {
      setSubmitError('Start and end time are both required.');
      return;
    }

    setSubmitting(true);
    try {
      await createBooking({
        equipmentId: Number(equipmentId),
        caseId: caseId ? Number(caseId) : undefined,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        notes: notes.trim() || undefined,
      });
      showToast('Equipment booking created.');
      onCreated();
      onClose();
    } catch (err) {
      // 409 (overlapping booking) surfaces here with the backend's own
      // human-readable message.
      setSubmitError(err instanceof ApiError ? err.message : 'Could not create this booking.');
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
      <div className="modal-box w-full max-w-[480px] bg-card-bg rounded-[18px] p-[26px_26px_22px] shadow-[0_30px_70px_rgba(10,30,30,0.28)] max-h-[86vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="font-display text-title-sm font-bold text-ink m-0">New equipment booking</h3>
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
            <label className="block text-body-sm font-semibold text-ink mb-1.5">Equipment</label>
            <select className="form-input" value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}>
              <option value="">Select equipment…</option>
              {equipmentList.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.name} ({eq.equipment_type})
                </option>
              ))}
            </select>
          </div>

          <div className="mb-3.5">
            <label className="block text-body-sm font-semibold text-ink mb-1.5">Linked case (optional)</label>
            <select className="form-input" value={caseId} onChange={(e) => setCaseId(e.target.value)} disabled={casesLoading}>
              <option value="">No specific case (general machine time)</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.case_number}
                </option>
              ))}
            </select>
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
              {submitting ? 'Creating…' : 'Create booking'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
