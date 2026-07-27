import { useEffect, useState } from 'react';
import { ApiError, createPurchaseOrder, listMaterials, listVendors } from '../lib/api';
import type { CreatePurchaseOrderItemInput, Material, Vendor } from '../lib/caseTypes';
import { useToast } from '../context/ToastContext';

interface NewPurchaseOrderModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

interface DraftItem {
  key: string;
  materialId: string;
  quantityOrdered: string;
  unitCost: string;
}

function emptyItem(): DraftItem {
  return { key: crypto.randomUUID(), materialId: '', quantityOrdered: '1', unitCost: '' };
}

// Confirmed against createPurchaseOrderSchema in procurement.controller.js
// — vendorId, notes (optional), items (min 1: materialId, quantityOrdered,
// unitCost). Same line-item array shape as NewInvoiceModal's lineItems.
export function NewPurchaseOrderModal({ open, onClose, onCreated }: NewPurchaseOrderModalProps) {
  const { showToast } = useToast();

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  const [vendorId, setVendorId] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<DraftItem[]>([emptyItem()]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSubmitError(null);
    setLoadingOptions(true);
    setOptionsError(null);
    Promise.all([listVendors(), listMaterials()])
      .then(([v, m]) => {
        setVendors(v.vendors);
        setMaterials(m.materials);
      })
      .catch((err) => setOptionsError(err instanceof ApiError ? err.message : 'Could not load vendors/materials.'))
      .finally(() => setLoadingOptions(false));
  }, [open]);

  useEffect(() => {
    if (!open) {
      setVendorId('');
      setNotes('');
      setItems([emptyItem()]);
    }
  }, [open]);

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  function removeItem(key: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!vendorId) {
      setSubmitError('Vendor is required.');
      return;
    }
    const cleanItems: CreatePurchaseOrderItemInput[] = [];
    for (const it of items) {
      if (!it.materialId) continue;
      cleanItems.push({
        materialId: Number(it.materialId),
        quantityOrdered: Number(it.quantityOrdered) || 1,
        unitCost: Number(it.unitCost) || 0,
      });
    }
    if (cleanItems.length === 0) {
      setSubmitError('At least one line item with a material is required.');
      return;
    }

    setSubmitting(true);
    try {
      await createPurchaseOrder({ vendorId: Number(vendorId), notes: notes || undefined, items: cleanItems });
      showToast('Purchase order created');
      onCreated();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not create the purchase order.');
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
      <div className="modal-box w-full max-w-[600px] bg-card-bg rounded-[20px] p-[26px_26px_22px] shadow-[0_30px_70px_rgba(10,30,30,0.28)] max-h-[86vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="font-display text-[17px] font-bold text-ink m-0">New purchase order</h3>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-page-bg-top border-0 cursor-pointer flex items-center justify-center shrink-0 hover:bg-border"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {(optionsError || submitError) && (
          <div className="text-[12.5px] text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5 mb-4">
            {submitError || optionsError}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-3.5">
            <label className="block text-[12.5px] font-semibold text-ink mb-1.5">Vendor</label>
            <select
              className="form-input"
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              disabled={loadingOptions}
              required
            >
              <option value="">Select a vendor…</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-3.5">
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[12.5px] font-semibold text-ink">Items</label>
              <button
                type="button"
                onClick={() => setItems((prev) => [...prev, emptyItem()])}
                className="text-[11.5px] font-semibold text-[#1C8A93] hover:underline"
              >
                + Add item
              </button>
            </div>
            <div className="space-y-2">
              {items.map((it) => (
                <div key={it.key} className="flex gap-2 items-start">
                  <select
                    className="form-input flex-1"
                    value={it.materialId}
                    onChange={(e) => updateItem(it.key, { materialId: e.target.value })}
                    disabled={loadingOptions}
                  >
                    <option value="">Material…</option>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="form-input w-20"
                    type="number"
                    min={0.01}
                    step="any"
                    placeholder="Qty"
                    value={it.quantityOrdered}
                    onChange={(e) => updateItem(it.key, { quantityOrdered: e.target.value })}
                  />
                  <input
                    className="form-input w-24"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="Unit $"
                    value={it.unitCost}
                    onChange={(e) => updateItem(it.key, { unitCost: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(it.key)}
                    disabled={items.length === 1}
                    className="w-9 h-9 rounded-lg border border-border bg-white shrink-0 disabled:opacity-30 hover:bg-page-bg-top"
                    aria-label="Remove item"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-[12.5px] font-semibold text-ink mb-1.5">Notes</label>
            <textarea
              className="form-input h-16 resize-none py-2"
              placeholder="optional"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
              disabled={submitting || loadingOptions}
              className="flex-1 h-10 rounded-[9px] text-white font-semibold text-[13px] cursor-pointer disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
            >
              {submitting ? 'Creating…' : 'Create purchase order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
