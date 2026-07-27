import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, getMaterial, listStockTransactions } from '../lib/api';
import type { Material, MaterialStockTransaction } from '../lib/caseTypes';
import { useAuth } from '../context/AuthContext';
import { MaterialStatusPill } from '../components/MaterialStatusPill';
import { StockTransactionModal } from '../components/StockTransactionModal';

export function MaterialDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [material, setMaterial] = useState<Material | null>(null);
  const [transactions, setTransactions] = useState<MaterialStockTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [txnModalOpen, setTxnModalOpen] = useState(false);

  const canRecord = Boolean(user); // Consume open to any internal staff; Adjust further gated inside the modal.

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    Promise.all([getMaterial(id), listStockTransactions(id)])
      .then(([m, t]) => {
        setMaterial(m.material);
        setTransactions(t.stockTransactions);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load this material.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-11 rounded-lg" />
        ))}
      </div>
    );
  }

  if (error || !material) {
    return (
      <div className="text-[12.5px] text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5">
        {error || 'Material not found.'}
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => navigate('/materials')} className="text-[12.5px] text-[#1C8A93] font-semibold mb-4">
        ← Back to materials
      </button>

      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="font-display text-lg font-bold text-ink mb-1">{material.name}</h2>
          <div className="flex items-center gap-2">
            <MaterialStatusPill status={material.status} />
            <span className="text-sm text-ink-soft">
              {Number(material.current_stock)} {material.unit} in stock
            </span>
          </div>
        </div>
        {canRecord && (
          <button
            onClick={() => setTxnModalOpen(true)}
            className="px-4 py-2.5 rounded-[10px] text-white text-[13px] font-semibold"
            style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
          >
            Record transaction
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="surface-card rounded-[16px] p-4">
          <p className="text-[11px] uppercase tracking-wider text-ink-soft mb-1">Unit cost</p>
          <p className="text-lg font-bold text-ink">${Number(material.unit_cost).toFixed(2)}</p>
        </div>
        <div className="surface-card rounded-[16px] p-4">
          <p className="text-[11px] uppercase tracking-wider text-ink-soft mb-1">Reorder threshold</p>
          <p className="text-lg font-bold text-ink">
            {Number(material.reorder_threshold)} {material.unit}
          </p>
        </div>
        <div className="surface-card rounded-[16px] p-4">
          <p className="text-[11px] uppercase tracking-wider text-ink-soft mb-1">Current stock</p>
          <p className="text-lg font-bold text-ink">
            {Number(material.current_stock)} {material.unit}
          </p>
        </div>
      </div>

      <div className="surface-card rounded-[18px] p-5">
        <h4 className="font-display text-sm font-bold text-ink mb-3">Transaction history</h4>
        {transactions.length === 0 ? (
          <div className="empty-state">
            <h4>No transactions yet</h4>
            <p>Consumption, receiving, and adjustments will show up here.</p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Type', 'Quantity', 'Lot #', 'Notes', 'Date'].map((h) => (
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
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td className="p-3 border-b border-border text-[13px] font-semibold">{t.type}</td>
                  <td
                    className={`p-3 border-b border-border text-[13px] ${
                      Number(t.quantity) < 0 ? 'text-[#9C4326]' : 'text-[#16A37A]'
                    }`}
                  >
                    {Number(t.quantity) > 0 ? '+' : ''}
                    {Number(t.quantity)}
                  </td>
                  <td className="p-3 border-b border-border text-[13px] font-mono text-ink-soft">{t.lot_number}</td>
                  <td className="p-3 border-b border-border text-[13px] text-ink-soft">{t.notes || '—'}</td>
                  <td className="p-3 border-b border-border text-[13px] text-ink-soft">
                    {new Date(t.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <StockTransactionModal
        open={txnModalOpen}
        material={material}
        onClose={() => setTxnModalOpen(false)}
        onRecorded={load}
      />
    </div>
  );
}
