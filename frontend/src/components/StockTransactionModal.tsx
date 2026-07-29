import { useEffect, useState } from 'react';
import { ApiError, adjustMaterial, consumeMaterial } from '../lib/api';
import type { Material } from '../lib/caseTypes';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { isManagerRole } from '../lib/permissions';

interface StockTransactionModalProps {
  open: boolean;
  material: Material | null;
  onClose: () => void;
  onRecorded: () => void;
}

type Mode = 'consume' | 'adjust';

// Confirmed against consumeMaterialSchema / adjustMaterialSchema in
// inventory.controller.js. Consume: quantity always positive (server
// applies the negative sign), lotNumber required, caseId/notes optional.
// Adjust: quantity is the actual signed delta (can be negative), lotNumber
// required, notes required (a reason). Adjust is requireManagerRole
// server-side — hidden client-side here for non-manager roles, same
// convention as canApprovePhotos elsewhere in this project.
export function StockTransactionModal({ open, material, onClose, onRecorded }: StockTransactionModalProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const canAdjust = isManagerRole(user);

  const [mode, setMode] = useState<Mode>('consume');
  const [quantity, setQuantity] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setMode('consume');
      setQuantity('');
      setLotNumber('');
      setNotes('');
      setSubmitError(null);
    }
  }, [open]);

  if (!material) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!lotNumber.trim()) {
      setSubmitError('Lot number is required.');
      return;
    }
    const qty = Number(quantity);
    if (!qty || (mode === 'consume' && qty <= 0)) {
      setSubmitError('A non-zero quantity is required.');
      return;
    }
    if (mode === 'adjust' && !notes.trim()) {
      setSubmitError('A reason is required for a manual adjustment.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'consume') {
        await consumeMaterial(material!.id, {
          quantity: Math.abs(qty),
          lotNumber: lotNumber.trim(),
          notes: notes || undefined,
        });
      } else {
        await adjustMaterial(material!.id, {
          quantity: qty,
          lotNumber: lotNumber.trim(),
          notes: notes.trim(),
        });
      }
      showToast(mode === 'consume' ? 'Consumption recorded' : 'Adjustment recorded');
      onRecorded();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not record the transaction.');
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
            <h3 className="font-display text-title-sm font-bold text-ink m-0">Record stock transaction</h3>
            <p className="text-xs text-ink-soft mt-0.5">{material.name}</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-page-bg-top border-0 cursor-pointer flex items-center justify-center shrink-0 hover:bg-border"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {canAdjust && (
          <div className="range-toggle mb-4">
            <button
              type="button"
              className={`range-btn ${mode === 'consume' ? 'active' : ''}`}
              onClick={() => setMode('consume')}
            >
              Consume
            </button>
            <button
              type="button"
              className={`range-btn ${mode === 'adjust' ? 'active' : ''}`}
              onClick={() => setMode('adjust')}
            >
              Adjust
            </button>
          </div>
        )}

        {submitError && (
          <div className="text-body-sm text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5 mb-4">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-3.5">
            <label className="block text-body-sm font-semibold text-ink mb-1.5">
              {mode === 'consume' ? 'Quantity used' : 'Signed quantity (+ or -)'}
            </label>
            <input
              className="form-input"
              type="number"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>

          <div className="mb-3.5">
            <label className="block text-body-sm font-semibold text-ink mb-1.5">Lot number</label>
            <input
              className="form-input"
              type="text"
              value={lotNumber}
              onChange={(e) => setLotNumber(e.target.value)}
            />
          </div>

          <div className="mb-4">
            <label className="block text-body-sm font-semibold text-ink mb-1.5">
              {mode === 'adjust' ? 'Reason (required)' : 'Notes (optional)'}
            </label>
            <textarea
              className="form-input h-16 resize-none py-2"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
              style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
            >
              {submitting ? 'Recording…' : 'Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
