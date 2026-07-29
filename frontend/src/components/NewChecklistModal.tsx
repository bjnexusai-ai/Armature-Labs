import { useEffect, useState } from 'react';
import { ApiError, createChecklist, listCaseTypes } from '../lib/api';
import type { CaseType } from '../lib/caseTypes';
import { useToast } from '../context/ToastContext';

interface NewChecklistModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

interface DraftItem {
  key: string;
  text: string;
}

function emptyItem(): DraftItem {
  return { key: crypto.randomUUID(), text: '' };
}

// Confirmed against createChecklistSchema in qc.controller.js — name,
// caseTypeId (optional), items (min 1 string). sort_order is derived
// server-side from array position, so this form's ordering IS the
// checklist's ordering.
export function NewChecklistModal({ open, onClose, onCreated }: NewChecklistModalProps) {
  const { showToast } = useToast();

  const [caseTypes, setCaseTypes] = useState<CaseType[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const [name, setName] = useState('');
  const [caseTypeId, setCaseTypeId] = useState('');
  const [items, setItems] = useState<DraftItem[]>([emptyItem()]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoadingOptions(true);
    listCaseTypes()
      .then((res) => setCaseTypes(res.caseTypes))
      .catch(() => {
        /* Non-fatal — caseTypeId is optional, form still works without the dropdown populated. */
      })
      .finally(() => setLoadingOptions(false));
  }, [open]);

  useEffect(() => {
    if (!open) {
      setName('');
      setCaseTypeId('');
      setItems([emptyItem()]);
      setError(null);
    }
  }, [open]);

  function updateItem(key: string, text: string) {
    setItems((its) => its.map((it) => (it.key === key ? { ...it, text } : it)));
  }

  function removeItem(key: string) {
    setItems((its) => (its.length > 1 ? its.filter((it) => it.key !== key) : its));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Checklist name is required.');
      return;
    }
    const cleanItems = items.map((it) => it.text.trim()).filter(Boolean);
    if (cleanItems.length === 0) {
      setError('At least one checklist item is required.');
      return;
    }

    setSubmitting(true);
    try {
      await createChecklist({
        name: name.trim(),
        caseTypeId: caseTypeId ? Number(caseTypeId) : undefined,
        items: cleanItems,
      });
      showToast('Checklist created');
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the checklist.');
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
            <h3 className="font-display text-title-sm font-bold text-ink m-0">New QC checklist</h3>
            <p className="text-xs text-ink-soft mt-0.5">Define the items technicians check off before final approval</p>
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
            <label className="block text-body-sm font-semibold text-ink mb-1.5">Checklist name</label>
            <input
              className="form-input"
              type="text"
              placeholder="e.g. Crown & Bridge final QC"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="mb-3.5">
            <label className="block text-body-sm font-semibold text-ink mb-1.5">
              Case type <span className="text-ink-soft font-normal">(optional)</span>
            </label>
            <select
              className="form-input"
              value={caseTypeId}
              onChange={(e) => setCaseTypeId(e.target.value)}
              disabled={loadingOptions}
            >
              <option value="">Applies to all case types</option>
              {caseTypes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-3.5">
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-body-sm font-semibold text-ink">Checklist items</label>
              <button
                type="button"
                onClick={() => setItems((its) => [...its, emptyItem()])}
                className="text-caption font-semibold text-[#1C8A93] hover:underline"
              >
                + Add item
              </button>
            </div>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={it.key} className="flex gap-2 items-center">
                  <span className="text-caption text-ink-soft w-4 shrink-0">{i + 1}.</span>
                  <input
                    className="form-input flex-1"
                    type="text"
                    placeholder="e.g. Margins verified under loupe"
                    value={it.text}
                    onChange={(e) => updateItem(it.key, e.target.value)}
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
              {submitting ? 'Creating…' : 'Create checklist'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
