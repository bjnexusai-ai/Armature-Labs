import { useEffect, useState } from 'react';
import { ApiError, createInvoice, listPractices } from '../lib/api';
import type { CreateInvoiceLineItemInput, Practice } from '../lib/caseTypes';
import { useToast } from '../context/ToastContext';

interface NewInvoiceModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

interface DraftLineItem {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

function emptyLineItem(): DraftLineItem {
  return { key: crypto.randomUUID(), description: '', quantity: '1', unitPrice: '' };
}

// Confirmed against createInvoiceSchema in billing.controller.js — practiceId,
// notes (optional), lineItems (min 1: description, quantity default 1,
// unitPrice). caseId per line item is optional and not exposed in this form
// (no case-picker in this session's scope) — a line item just isn't tied to
// a specific case unless added later some other way.
export function NewInvoiceModal({ open, onClose, onCreated }: NewInvoiceModalProps) {
  const { showToast } = useToast();

  const [practices, setPractices] = useState<Practice[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  const [practiceId, setPracticeId] = useState('');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [taxAmount, setTaxAmount] = useState('');
  const [lineItems, setLineItems] = useState<DraftLineItem[]>([emptyLineItem()]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSubmitError(null);
    setLoadingOptions(true);
    setOptionsError(null);
    listPractices()
      .then((res) => setPractices(res.practices))
      .catch((err) => {
        setOptionsError(err instanceof ApiError ? err.message : 'Could not load practices.');
      })
      .finally(() => setLoadingOptions(false));
  }, [open]);

  useEffect(() => {
    if (!open) {
      setPracticeId('');
      setNotes('');
      setDueDate('');
      setTaxAmount('');
      setLineItems([emptyLineItem()]);
    }
  }, [open]);

  const subtotal = lineItems.reduce((sum, li) => {
    const qty = Number(li.quantity) || 0;
    const price = Number(li.unitPrice) || 0;
    return sum + qty * price;
  }, 0);

  function updateLineItem(key: string, patch: Partial<DraftLineItem>) {
    setLineItems((items) => items.map((li) => (li.key === key ? { ...li, ...patch } : li)));
  }

  function removeLineItem(key: string) {
    setLineItems((items) => (items.length > 1 ? items.filter((li) => li.key !== key) : items));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!practiceId) {
      setSubmitError('Practice is required.');
      return;
    }
    const cleanLineItems: CreateInvoiceLineItemInput[] = [];
    for (const li of lineItems) {
      if (!li.description.trim()) continue;
      cleanLineItems.push({
        description: li.description.trim(),
        quantity: Number(li.quantity) || 1,
        unitPrice: Number(li.unitPrice) || 0,
      });
    }
    if (cleanLineItems.length === 0) {
      setSubmitError('At least one line item with a description is required.');
      return;
    }

    setSubmitting(true);
    try {
      await createInvoice({
        practiceId: Number(practiceId),
        notes: notes || undefined,
        dueDate: dueDate || undefined,
        taxAmount: taxAmount ? Number(taxAmount) : undefined,
        lineItems: cleanLineItems,
      });
      showToast('Invoice created');
      onCreated();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not create the invoice.');
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
      <div className="modal-box w-full max-w-[560px] bg-card-bg rounded-[18px] p-[26px_26px_22px] shadow-[0_30px_70px_rgba(10,30,30,0.28)] max-h-[86vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="font-display text-title-sm font-bold text-ink m-0">New invoice</h3>
            <p className="text-xs text-ink-soft mt-0.5">Bills the selected practice for the line items below</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-page-bg-top border-0 cursor-pointer flex items-center justify-center shrink-0 hover:bg-border"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {optionsError && (
          <div className="text-body-sm text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5 mb-4">
            {optionsError}
          </div>
        )}
        {submitError && (
          <div className="text-body-sm text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5 mb-4">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-3.5">
            <label className="block text-body-sm font-semibold text-ink mb-1.5">Practice</label>
            <select
              className="form-input"
              value={practiceId}
              onChange={(e) => setPracticeId(e.target.value)}
              disabled={loadingOptions}
              required
            >
              <option value="">Select a practice…</option>
              {practices.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.practice_name}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-3.5">
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-body-sm font-semibold text-ink">Line items</label>
              <button
                type="button"
                onClick={() => setLineItems((items) => [...items, emptyLineItem()])}
                className="text-caption font-semibold text-[#1C8A93] hover:underline"
              >
                + Add line item
              </button>
            </div>
            <div className="space-y-2">
              {lineItems.map((li) => (
                <div key={li.key} className="flex gap-2 items-start">
                  <input
                    className="form-input flex-1"
                    type="text"
                    placeholder="Description"
                    value={li.description}
                    onChange={(e) => updateLineItem(li.key, { description: e.target.value })}
                  />
                  <input
                    className="form-input w-16"
                    type="number"
                    min={1}
                    placeholder="Qty"
                    value={li.quantity}
                    onChange={(e) => updateLineItem(li.key, { quantity: e.target.value })}
                  />
                  <input
                    className="form-input w-24"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="Unit $"
                    value={li.unitPrice}
                    onChange={(e) => updateLineItem(li.key, { unitPrice: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => removeLineItem(li.key)}
                    disabled={lineItems.length === 1}
                    className="w-9 h-9 rounded-lg border border-border bg-white shrink-0 disabled:opacity-30 hover:bg-page-bg-top"
                    aria-label="Remove line item"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <p className="text-right text-body-sm font-semibold text-ink mt-2">
              Subtotal: ${subtotal.toFixed(2)}
              {Number(taxAmount) > 0 && (
                <>
                  {' '}
                  + tax ${Number(taxAmount).toFixed(2)} = total ${(subtotal + Number(taxAmount)).toFixed(2)}
                </>
              )}
            </p>
          </div>

          <div className="flex gap-2.5 mb-3.5">
            <div className="flex-1">
              <label className="block text-body-sm font-semibold text-ink mb-1.5">Due date (optional)</label>
              <input className="form-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="flex-1">
              <label className="block text-body-sm font-semibold text-ink mb-1.5">Tax amount ($, optional)</label>
              <input
                className="form-input"
                type="number"
                min={0}
                step="0.01"
                placeholder="0.00"
                value={taxAmount}
                onChange={(e) => setTaxAmount(e.target.value)}
              />
            </div>
          </div>

          <div className="mb-3.5">
            <label className="block text-body-sm font-semibold text-ink mb-1.5">Notes</label>
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
              className="flex-1 h-10 rounded-[10px] border border-border bg-white font-semibold text-body-sm cursor-pointer hover:bg-page-bg-top"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || loadingOptions}
              className="flex-1 h-10 rounded-[10px] text-white font-semibold text-body-sm cursor-pointer disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
            >
              {submitting ? 'Creating…' : 'Create invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
