import { useEffect, useState } from 'react';
import { ApiError, createMaterial, createMaterialCategory, listMaterialCategories } from '../lib/api';
import type { MaterialCategory } from '../lib/caseTypes';
import { useToast } from '../context/ToastContext';

interface NewMaterialModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

// Confirmed against createMaterialSchema in inventory.controller.js —
// categoryId, name, unit, unitCost (default 0), reorderThreshold (default
// 0), initialStock (optional starting count, recorded as an 'Adjustment'
// transaction server-side). No standalone category-management screen in
// this session's scope, so category creation is an inline "+ new category"
// toggle right here instead.
export function NewMaterialModal({ open, onClose, onCreated }: NewMaterialModalProps) {
  const { showToast } = useToast();

  const [categories, setCategories] = useState<MaterialCategory[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  const [categoryId, setCategoryId] = useState('');
  const [newCategoryMode, setNewCategoryMode] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [reorderThreshold, setReorderThreshold] = useState('');
  const [initialStock, setInitialStock] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function loadCategories() {
    setLoadingOptions(true);
    setOptionsError(null);
    listMaterialCategories()
      .then((res) => setCategories(res.categories))
      .catch((err) => setOptionsError(err instanceof ApiError ? err.message : 'Could not load categories.'))
      .finally(() => setLoadingOptions(false));
  }

  useEffect(() => {
    if (!open) return;
    setSubmitError(null);
    loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) {
      setCategoryId('');
      setNewCategoryMode(false);
      setNewCategoryName('');
      setName('');
      setUnit('');
      setUnitCost('');
      setReorderThreshold('');
      setInitialStock('');
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!name.trim() || !unit.trim()) {
      setSubmitError('Name and unit are required.');
      return;
    }

    setSubmitting(true);
    try {
      let resolvedCategoryId = categoryId ? Number(categoryId) : null;
      if (newCategoryMode) {
        if (!newCategoryName.trim()) {
          setSubmitError('New category name is required.');
          setSubmitting(false);
          return;
        }
        const created = await createMaterialCategory({ name: newCategoryName.trim() });
        resolvedCategoryId = created.category.id;
      }
      if (!resolvedCategoryId) {
        setSubmitError('A category is required.');
        setSubmitting(false);
        return;
      }

      await createMaterial({
        categoryId: resolvedCategoryId,
        name: name.trim(),
        unit: unit.trim(),
        unitCost: unitCost ? Number(unitCost) : undefined,
        reorderThreshold: reorderThreshold ? Number(reorderThreshold) : undefined,
        initialStock: initialStock ? Number(initialStock) : undefined,
      });
      showToast('Material created');
      onCreated();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not create the material.');
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
      <div className="modal-box w-full max-w-[520px] bg-card-bg rounded-[18px] p-[26px_26px_22px] shadow-[0_30px_70px_rgba(10,30,30,0.28)] max-h-[86vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="font-display text-title-sm font-bold text-ink m-0">New material</h3>
            <p className="text-xs text-ink-soft mt-0.5">Adds a material to the catalog</p>
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
          <div className="text-body-sm text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5 mb-4">
            {submitError || optionsError}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-3.5">
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-body-sm font-semibold text-ink">Category</label>
              <button
                type="button"
                onClick={() => setNewCategoryMode((v) => !v)}
                className="text-caption font-semibold text-[#1C8A93] hover:underline"
              >
                {newCategoryMode ? 'Choose existing instead' : '+ new category'}
              </button>
            </div>
            {newCategoryMode ? (
              <input
                className="form-input"
                type="text"
                placeholder="New category name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
              />
            ) : (
              <select
                className="form-input"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                disabled={loadingOptions}
                required
              >
                <option value="">Select a category…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="mb-3.5">
            <label className="block text-body-sm font-semibold text-ink mb-1.5">Name</label>
            <input className="form-input" type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="flex gap-2.5 mb-3.5">
            <div className="flex-1">
              <label className="block text-body-sm font-semibold text-ink mb-1.5">Unit</label>
              <input
                className="form-input"
                type="text"
                placeholder="e.g. g, box, unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className="block text-body-sm font-semibold text-ink mb-1.5">Unit cost ($)</label>
              <input
                className="form-input"
                type="number"
                min={0}
                step="0.01"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2.5 mb-4">
            <div className="flex-1">
              <label className="block text-body-sm font-semibold text-ink mb-1.5">Reorder threshold</label>
              <input
                className="form-input"
                type="number"
                min={0}
                value={reorderThreshold}
                onChange={(e) => setReorderThreshold(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className="block text-body-sm font-semibold text-ink mb-1.5">Initial stock (optional)</label>
              <input
                className="form-input"
                type="number"
                min={0}
                value={initialStock}
                onChange={(e) => setInitialStock(e.target.value)}
              />
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
              disabled={submitting || loadingOptions}
              className="flex-1 h-10 rounded-[10px] text-white font-semibold text-body-sm cursor-pointer disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
            >
              {submitting ? 'Creating…' : 'Create material'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
