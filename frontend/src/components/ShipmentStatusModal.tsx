import { useEffect, useState } from 'react';
import { ApiError, updateShipmentStatus } from '../lib/api';
import type { Shipment, ShipmentStatus } from '../lib/caseTypes';
import { useToast } from '../context/ToastContext';

const STATUS_OPTIONS: ShipmentStatus[] = ['Preparing', 'Shipped', 'Delivered', 'Returned'];

interface ShipmentStatusModalProps {
  shipment: Shipment | null;
  onClose: () => void;
  onUpdated: () => void;
}

// Confirmed against updateShipmentStatusSchema in fulfillment.controller.js
// — status (enum), carrier/trackingNumber both optional so this can also
// double as "fill in the carrier once it's known" without forcing a status
// change. shipped_at/delivered_at are set server-side, not sent from here.
export function ShipmentStatusModal({ shipment, onClose, onUpdated }: ShipmentStatusModalProps) {
  const { showToast } = useToast();
  const [status, setStatus] = useState<ShipmentStatus>('Preparing');
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = shipment != null;

  useEffect(() => {
    if (shipment) {
      setStatus(shipment.status);
      setCarrier(shipment.carrier || '');
      setTrackingNumber(shipment.tracking_number || '');
      setError(null);
    }
  }, [shipment]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!shipment) return;
    setSubmitting(true);
    setError(null);
    try {
      await updateShipmentStatus(shipment.id, {
        status,
        carrier: carrier.trim() || undefined,
        trackingNumber: trackingNumber.trim() || undefined,
      });
      showToast('Shipment updated');
      onUpdated();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update this shipment.');
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
      {shipment && (
        <div className="modal-box w-full max-w-[420px] bg-card-bg rounded-[18px] p-[26px_26px_22px] shadow-[0_30px_70px_rgba(10,30,30,0.28)] max-h-[86vh] overflow-y-auto">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="font-display text-title-sm font-bold text-ink m-0">Update shipment</h3>
              <p className="text-xs text-ink-soft mt-0.5 font-mono">Shipment #{shipment.id}</p>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg bg-page-bg-top border-0 cursor-pointer flex items-center justify-center shrink-0 hover:bg-border"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {error && (
            <div className="text-body-sm text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5 mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="mb-3.5">
              <label className="block text-body-sm font-semibold text-ink mb-1.5">Status</label>
              <select className="form-input" value={status} onChange={(e) => setStatus(e.target.value as ShipmentStatus)}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-3.5">
              <label className="block text-body-sm font-semibold text-ink mb-1.5">
                Carrier <span className="text-ink-soft font-normal">(optional)</span>
              </label>
              <input className="form-input" type="text" placeholder="e.g. FedEx" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
            </div>
            <div className="mb-3.5">
              <label className="block text-body-sm font-semibold text-ink mb-1.5">
                Tracking number <span className="text-ink-soft font-normal">(optional)</span>
              </label>
              <input
                className="form-input"
                type="text"
                placeholder="e.g. 7712 4456 9021"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
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
                {submitting ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
