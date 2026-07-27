import { useEffect, useState } from 'react';
import { ApiError, createVendor } from '../lib/api';
import { useToast } from '../context/ToastContext';

interface NewVendorModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

// Confirmed against createVendorSchema in procurement.controller.js — name
// required, contactName/email/phone/address all optional.
export function NewVendorModal({ open, onClose, onCreated }: NewVendorModalProps) {
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setName('');
      setContactName('');
      setEmail('');
      setPhone('');
      setAddress('');
      setSubmitError(null);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!name.trim()) {
      setSubmitError('Vendor name is required.');
      return;
    }
    setSubmitting(true);
    try {
      await createVendor({
        name: name.trim(),
        contactName: contactName || undefined,
        email: email || undefined,
        phone: phone || undefined,
        address: address || undefined,
      });
      showToast('Vendor created');
      onCreated();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not create the vendor.');
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
      <div className="modal-box w-full max-w-[460px] bg-card-bg rounded-[20px] p-[26px_26px_22px] shadow-[0_30px_70px_rgba(10,30,30,0.28)] max-h-[86vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="font-display text-[17px] font-bold text-ink m-0">New vendor</h3>
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

        <form onSubmit={handleSubmit}>
          <div className="mb-3.5">
            <label className="block text-[12.5px] font-semibold text-ink mb-1.5">Name</label>
            <input className="form-input" type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="mb-3.5">
            <label className="block text-[12.5px] font-semibold text-ink mb-1.5">Contact name</label>
            <input
              className="form-input"
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
            />
          </div>
          <div className="flex gap-2.5 mb-3.5">
            <div className="flex-1">
              <label className="block text-[12.5px] font-semibold text-ink mb-1.5">Email</label>
              <input className="form-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="flex-1">
              <label className="block text-[12.5px] font-semibold text-ink mb-1.5">Phone</label>
              <input className="form-input" type="text" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-[12.5px] font-semibold text-ink mb-1.5">Address</label>
            <textarea
              className="form-input h-16 resize-none py-2"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
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
              disabled={submitting}
              className="flex-1 h-10 rounded-[9px] text-white font-semibold text-[13px] cursor-pointer disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
            >
              {submitting ? 'Creating…' : 'Create vendor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
