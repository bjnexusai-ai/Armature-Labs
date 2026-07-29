import { useEffect, useState } from 'react';
import { ApiError, createEquipmentItem } from '../lib/api';
import type { EquipmentType } from '../lib/equipmentTypes';
import { useToast } from '../context/ToastContext';

interface NewEquipmentModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const EQUIPMENT_TYPES: EquipmentType[] = ['Milling Machine', 'Printer', 'Furnace', 'Scanner', 'Other'];

/** Confirmed against createEquipmentSchema in equipment.controller.js —
 * name + equipmentType required, serialNumber optional. Catalog creation
 * is requireManagerRole server-side; this modal is only reachable from
 * EquipmentPage's "+ New equipment" button, itself gated to Owner/Office
 * Manager, same convention as NewMaterialModal. */
export function NewEquipmentModal({ open, onClose, onCreated }: NewEquipmentModalProps) {
  const { showToast } = useToast();

  const [name, setName] = useState('');
  const [equipmentType, setEquipmentType] = useState<EquipmentType>('Milling Machine');
  const [serialNumber, setSerialNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setName('');
      setEquipmentType('Milling Machine');
      setSerialNumber('');
      setSubmitError(null);
    }
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
      await createEquipmentItem({
        name: name.trim(),
        equipmentType,
        serialNumber: serialNumber.trim() || undefined,
      });
      showToast('Equipment added.');
      onCreated();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not add this equipment.');
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
            <h3 className="font-display text-title-sm font-bold text-ink m-0">New equipment</h3>
            <p className="text-xs text-ink-soft mt-0.5">Adds a machine to the catalog.</p>
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
              placeholder="e.g. Mill #2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="mb-3.5">
            <label className="block text-body-sm font-semibold text-ink mb-1.5">Type</label>
            <select className="form-input" value={equipmentType} onChange={(e) => setEquipmentType(e.target.value as EquipmentType)}>
              {EQUIPMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-body-sm font-semibold text-ink mb-1.5">Serial number (optional)</label>
            <input className="form-input" type="text" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
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
              {submitting ? 'Adding…' : 'Add equipment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
