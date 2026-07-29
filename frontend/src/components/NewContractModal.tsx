import { useEffect, useState } from 'react';
import { ApiError, createPracticeContract } from '../lib/api';
import { useToast } from '../context/ToastContext';

interface NewContractModalProps {
  open: boolean;
  practiceId: number;
  onClose: () => void;
  onCreated: () => void;
}

// Confirmed against createContractSchema in accounts.controller.js —
// paymentTerms, creditLimit (default 0), contractStartDate required,
// contractEndDate optional. salesRepId left unset — no staff picker in
// this session's scope.
export function NewContractModal({ open, practiceId, onClose, onCreated }: NewContractModalProps) {
  const { showToast } = useToast();
  const [paymentTerms, setPaymentTerms] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPaymentTerms('');
      setCreditLimit('');
      setStartDate('');
      setEndDate('');
      setSubmitError(null);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!paymentTerms.trim() || !startDate) {
      setSubmitError('Payment terms and a start date are required.');
      return;
    }
    setSubmitting(true);
    try {
      await createPracticeContract(practiceId, {
        paymentTerms: paymentTerms.trim(),
        creditLimit: creditLimit ? Number(creditLimit) : undefined,
        contractStartDate: startDate,
        contractEndDate: endDate || undefined,
      });
      showToast('Contract created');
      onCreated();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not create the contract.');
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
          <h3 className="font-display text-title-sm font-bold text-ink m-0">New contract</h3>
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
            <label className="block text-body-sm font-semibold text-ink mb-1.5">Payment terms</label>
            <input
              className="form-input"
              type="text"
              placeholder="e.g. Net 30"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
            />
          </div>
          <div className="mb-3.5">
            <label className="block text-body-sm font-semibold text-ink mb-1.5">Credit limit ($)</label>
            <input
              className="form-input"
              type="number"
              min={0}
              step="0.01"
              value={creditLimit}
              onChange={(e) => setCreditLimit(e.target.value)}
            />
          </div>
          <div className="flex gap-2.5 mb-4">
            <div className="flex-1">
              <label className="block text-body-sm font-semibold text-ink mb-1.5">Start date</label>
              <input
                className="form-input"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className="block text-body-sm font-semibold text-ink mb-1.5">End date (optional)</label>
              <input className="form-input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
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
              {submitting ? 'Creating…' : 'Create contract'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
