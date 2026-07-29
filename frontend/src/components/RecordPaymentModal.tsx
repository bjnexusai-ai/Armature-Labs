import { useEffect, useState } from 'react';
import { ApiError, recordPayment } from '../lib/api';
import type { InvoiceDetail } from '../lib/caseTypes';
import { useToast } from '../context/ToastContext';

interface RecordPaymentModalProps {
  invoice: InvoiceDetail | null;
  onClose: () => void;
  onDone: () => void;
}

// Manual mark-paid only — confirmed against recordPaymentSchema in
// billing.controller.js (amount, method, referenceNote). Real Stripe/ACH
// checkout is backend Session 8; this form is for recording a payment
// someone already collected offline (check, cash, bank transfer), not a
// "Pay Now" processor flow.
export function RecordPaymentModal({ invoice, onClose, onDone }: RecordPaymentModalProps) {
  const { showToast } = useToast();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Check');
  const [referenceNote, setReferenceNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = invoice != null;
  const balanceDue = invoice ? Number(invoice.subtotal) - Number(invoice.amount_paid) : 0;

  useEffect(() => {
    if (open && invoice) {
      setAmount(balanceDue > 0 ? balanceDue.toFixed(2) : '');
      setReferenceNote('');
      setMethod('Check');
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoice?.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice) return;

    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      setError('Enter a payment amount greater than 0.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await recordPayment(invoice.id, {
        amount: numericAmount,
        method,
        referenceNote: referenceNote || undefined,
      });
      showToast('Payment recorded');
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record the payment.');
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
      {invoice && (
        <div className="modal-box w-full max-w-[420px] bg-card-bg rounded-[18px] p-[26px_26px_22px] shadow-[0_30px_70px_rgba(10,30,30,0.28)] max-h-[86vh] overflow-y-auto">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="font-display text-title-sm font-bold text-ink m-0">Record payment</h3>
              <p className="text-xs text-ink-soft mt-0.5 font-mono">{invoice.invoice_number}</p>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg bg-page-bg-top border-0 cursor-pointer flex items-center justify-center shrink-0 hover:bg-border"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <p className="text-body-sm text-ink-soft mb-4">
            Balance due: <span className="font-semibold text-ink">${balanceDue.toFixed(2)}</span>
          </p>

          {error && (
            <div className="text-body-sm text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5 mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="mb-3.5">
              <label className="block text-body-sm font-semibold text-ink mb-1.5">Amount ($)</label>
              <input
                className="form-input"
                type="number"
                min={0.01}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>

            <div className="mb-3.5">
              <label className="block text-body-sm font-semibold text-ink mb-1.5">Method</label>
              <select className="form-input" value={method} onChange={(e) => setMethod(e.target.value)}>
                <option>Check</option>
                <option>Cash</option>
                <option>Bank Transfer</option>
                <option>Other</option>
              </select>
            </div>

            <div className="mb-3.5">
              <label className="block text-body-sm font-semibold text-ink mb-1.5">
                Reference note <span className="text-ink-soft font-normal">(optional)</span>
              </label>
              <input
                className="form-input"
                type="text"
                placeholder="e.g. Check #1042"
                value={referenceNote}
                onChange={(e) => setReferenceNote(e.target.value)}
                maxLength={255}
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
                {submitting ? 'Recording…' : 'Mark as paid'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
