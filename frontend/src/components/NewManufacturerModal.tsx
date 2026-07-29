import { useEffect, useState } from 'react';
import { ApiError, createManufacturer } from '../lib/api';
import { useToast } from '../context/ToastContext';

interface NewManufacturerModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

// Confirmed against createManufacturerSchema in manufacturers.controller.js:
// name (required), contactName/email/phone (optional), country (required,
// 2-letter, uppercased server-side). No Stripe fields in this form — the
// Connect account is created lazily on first "Start onboarding" click from
// the detail page, not here.
export function NewManufacturerModal({ open, onClose, onCreated }: NewManufacturerModalProps) {
  const { showToast } = useToast();

  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setName('');
      setContactName('');
      setEmail('');
      setPhone('');
      setCountry('');
      setSubmitError(null);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!name.trim()) {
      setSubmitError('Name is required.');
      return;
    }
    if (country.trim().length !== 2) {
      setSubmitError('Country must be a 2-letter code (e.g. US, DE, CN).');
      return;
    }

    setSubmitting(true);
    try {
      await createManufacturer({
        name: name.trim(),
        contactName: contactName.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        country: country.trim(),
      });
      showToast('Manufacturer added');
      onCreated();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not add the manufacturer.');
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
            <h3 className="font-display text-title-sm font-bold text-ink m-0">New manufacturer</h3>
            <p className="text-xs text-ink-soft mt-0.5">
              Stripe Connect onboarding is a separate step, from the detail page
            </p>
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
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Precision Dental Milling Co."
              required
            />
          </div>

          <div className="mb-3.5">
            <label className="block text-body-sm font-semibold text-ink mb-1.5">Contact name</label>
            <input
              className="form-input"
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3.5">
            <div>
              <label className="block text-body-sm font-semibold text-ink mb-1.5">Email</label>
              <input className="form-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="block text-body-sm font-semibold text-ink mb-1.5">Phone</label>
              <input className="form-input" type="text" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>

          <div className="mb-5">
            <label className="block text-body-sm font-semibold text-ink mb-1.5">Country (2-letter code)</label>
            <input
              className="form-input w-24"
              type="text"
              maxLength={2}
              value={country}
              onChange={(e) => setCountry(e.target.value.toUpperCase())}
              placeholder="US"
              required
            />
            <p className="text-caption text-ink-soft mt-1.5">
              Used for the Stripe Connect account — Stripe itself is the source of truth on which
              countries support payouts, not a list baked in here.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-[10px] border border-border text-body-sm font-semibold hover:bg-page-bg-top"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2.5 rounded-[10px] text-white text-body-sm font-semibold disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
            >
              {submitting ? 'Adding…' : 'Add manufacturer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
