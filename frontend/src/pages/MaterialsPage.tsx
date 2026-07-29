import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, listMaterialCategories, listMaterials } from '../lib/api';
import type { Material, MaterialCategory } from '../lib/caseTypes';
import { useAuth } from '../context/AuthContext';
import { MaterialStatusPill } from '../components/MaterialStatusPill';
import { NewMaterialModal } from '../components/NewMaterialModal';
import { isManagerRole } from '../lib/permissions';

// Confirmed against inventory.controller.js — entire router is
// requireInternal (no dentist_client access), so this page is reachable
// only via navConfig's roles gate (owner/office_manager/
// assistant_technician/designer), mirrored server-side.
export function MaterialsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [materials, setMaterials] = useState<Material[]>([]);
  const [categories, setCategories] = useState<MaterialCategory[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newMaterialOpen, setNewMaterialOpen] = useState(false);

  // Category/material creation is requireManagerRole server-side.
  const canCreate = isManagerRole(user);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      listMaterials({ categoryId: categoryFilter ?? undefined, lowStock: lowStockOnly || undefined }),
      listMaterialCategories(),
    ])
      .then(([m, c]) => {
        setMaterials(m.materials);
        setCategories(c.categories);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load materials.'))
      .finally(() => setLoading(false));
  }, [categoryFilter, lowStockOnly]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="font-display text-lg font-bold text-ink mb-1">Materials</h2>
          <p className="text-sm text-ink-soft">Catalog and current stock levels.</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setNewMaterialOpen(true)}
            className="px-4 py-2.5 rounded-[10px] text-white text-[13px] font-semibold"
            style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
          >
            + New material
          </button>
        )}
      </div>

      <div className="range-toggle mb-4 flex-wrap">
        <button
          className={`range-btn ${categoryFilter === null ? 'active' : ''}`}
          onClick={() => setCategoryFilter(null)}
        >
          All categories
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            className={`range-btn ${categoryFilter === c.id ? 'active' : ''}`}
            onClick={() => setCategoryFilter(c.id)}
          >
            {c.name}
          </button>
        ))}
        <button
          className={`range-btn ${lowStockOnly ? 'active' : ''}`}
          onClick={() => setLowStockOnly((v) => !v)}
        >
          Low stock only
        </button>
      </div>

      <div className="surface-card rounded-[18px] p-5">
        {error && (
          <div className="text-[12.5px] text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5 mb-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton h-11 rounded-lg" />
            ))}
          </div>
        ) : materials.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M3.5 8 12 3.5 20.5 8 12 12.5 3.5 8Z" />
              <path d="M3.5 8v8L12 20.5 20.5 16V8" />
            </svg>
            <h4>No materials yet</h4>
            <p>Nothing has been added to the catalog yet.</p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Name', 'Category', 'Unit', 'Unit cost', 'Current stock', 'Status', ''].map((h) => (
                  <th
                    key={h}
                    className="text-left text-[11px] uppercase tracking-wider text-ink-soft pb-2.5 border-b border-border"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {materials.map((m) => {
                const category = categories.find((c) => c.id === m.category_id);
                return (
                  <tr
                    key={m.id}
                    className="hover:bg-page-bg-top transition-colors cursor-pointer"
                    onClick={() => navigate(`/materials/${m.id}`)}
                  >
                    <td className="p-3 border-b border-border text-[13px] font-semibold">{m.name}</td>
                    <td className="p-3 border-b border-border text-[13px] text-ink-soft">{category?.name ?? '—'}</td>
                    <td className="p-3 border-b border-border text-[13px] text-ink-soft">{m.unit}</td>
                    <td className="p-3 border-b border-border text-[13px]">${Number(m.unit_cost).toFixed(2)}</td>
                    <td className="p-3 border-b border-border text-[13px]">
                      {Number(m.current_stock)} {m.unit}
                    </td>
                    <td className="p-3 border-b border-border">
                      <MaterialStatusPill status={m.status} />
                    </td>
                    <td className="p-3 border-b border-border text-right text-[12px] text-[#1C8A93] font-semibold">
                      View →
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <NewMaterialModal open={newMaterialOpen} onClose={() => setNewMaterialOpen(false)} onCreated={load} />
    </div>
  );
}
