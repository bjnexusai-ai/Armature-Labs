import { useEffect, useState } from 'react';
import { ApiError, receivePurchaseOrder } from '../lib/api';
import type { PurchaseOrder, ReceivePurchaseOrderItemInput } from '../lib/caseTypes';
import { useToast } from '../context/ToastContext';

interface ReceivePOModalProps {
  open: boolean;
  purchaseOrder: PurchaseOrder | null;
  onClose: () => void;
  onReceived: () => void;
}

interface DraftReceipt {
  purchaseOrderItemId: number;
  materialLabel: string;
  remaining: number;
  quantityReceived: string;
  lotNumber: string;
}

// Confirmed against receivePurchaseOrderSchema in procurement.controller.js
// — items[]: purchaseOrderItemId, quantityReceived, lotNumber. Only shows
// items with remaining quantity > 0; the backend independently re-validates
// every amount against quantity_ordered - quantity_received (409 if it
// would exceed remaining), so this form isn't trying to be the source of
// truth, just a convenience filter.
export function ReceivePOModal({ open, purchaseOrder, onClose, onReceived }: ReceivePOModalProps) {
  const { showToast } = useToast();
  const [drafts, setDrafts] = useState<DraftReceipt[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !purchaseOrder?.items) {
      setDrafts([]);
      setSubmitError(null);
      return;
    }
    setDrafts(
      purchaseOrder.items
        .map((it) => ({
          purchaseOrderItemId: it.id,
          materialLabel: `Material #${it.material_id}`,
          remaining: Number(it.quantity_ordered) - Number(it.quantity_received),
          quantityReceived: '',
          lotNumber: '',
        }))
        .filter((d) => d.remaining > 0)
    );
  }, [open, purchaseOrder]);

  if (!purchaseOrder) return null;

  function updateDraft(id: number, patch: Partial<DraftReceipt>) {
    setDrafts((prev) => prev.map((d) => (d.purchaseOrderItemId === id ? { ...d, ...patch } : d)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const cleanItems: ReceivePurchaseOrderItemInput[] = [];
    for (const d of drafts) {
      const qty = Number(d.quantityReceived);
      if (!qty || qty <= 0) continue;
      if (!d.lotNumber.trim()) {
        setSubmitError('Lot number is required for every item being received.');
        return;
      }
      cleanItems.push({ purchaseOrderItemId: d.purchaseOrderItemId, quantityReceived: qty, lotNumber: d.lotNumber.trim() });
    }
    if (cleanItems.length === 0) {
      setSubmitError('Enter a quantity for at least one item.');
      return;
    }

    setSubmitting(true);
    try {
      await receivePurchaseOrder(purchaseOrder!.id, { items: cleanItems });
      showToast('Receipt recorded');
      onReceived();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not record the receipt.');
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
      <div className="modal-box w-full max-w-[520px] bg-card-bg rounded-[20px] p-[26px_26px_22px] shadow-[0_30px_70px_rgba(10,30,30,0.28)] max-h-[86vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="font-display text-[17px] font-bold text-ink m-0">Receive against {purchaseOrder.po_number}</h3>
            <p className="text-xs text-ink-soft mt-0.5">Only items with remaining quantity are shown</p>
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

        {drafts.length === 0 ? (
          <p className="text-[13px] text-ink-soft">Nothing left to receive on this purchase order.</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="space-y-3 mb-4">
              {drafts.map((d) => (
                <div key={d.purchaseOrderItemId} className="border border-border rounded-xl p-3">
                  <p className="text-[12.5px] font-semibold text-ink mb-2">
                    {d.materialLabel} — {d.remaining} remaining
                  </p>
                  <div className="flex gap-2">
                    <input
                      className="form-input flex-1"
                      type="number"
                      min={0}
                      max={d.remaining}
                      step="any"
                      placeholder="Qty received"
                      value={d.quantityReceived}
                      onChange={(e) => updateDraft(d.purchaseOrderItemId, { quantityReceived: e.target.value })}
                    />
                    <input
                      className="form-input flex-1"
                      type="text"
                      placeholder="Lot number"
                      value={d.lotNumber}
                      onChange={(e) => updateDraft(d.purchaseOrderItemId, { lotNumber: e.target.value })}
                    />
                  </div>
                </div>
              ))}
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
                {submitting ? 'Recording…' : 'Record receipt'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
