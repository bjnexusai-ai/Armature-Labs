import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ApiError, getPurchaseOrder, updatePurchaseOrderStatus } from '../lib/api';
import type { PurchaseOrder } from '../lib/caseTypes';
import { POStatusPill } from '../components/POStatusPill';
import { ReceivePOModal } from '../components/ReceivePOModal';
import { useToast } from '../context/ToastContext';

// Only Draft -> Ordered / -> Cancelled are legal manual transitions
// (confirmed against updatePoStatusSchema); Partially Received/Received are
// derived automatically by receivePurchaseOrder and are never offered here
// as buttons.
export function PurchaseOrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [statusSubmitting, setStatusSubmitting] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    getPurchaseOrder(id)
      .then((res) => setPo(res.purchaseOrder))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load this purchase order.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleStatus(status: 'Ordered' | 'Cancelled') {
    if (!po) return;
    setStatusSubmitting(true);
    try {
      await updatePurchaseOrderStatus(po.id, { status });
      showToast(`Marked as ${status}`);
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not update status.');
    } finally {
      setStatusSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-11 rounded-lg" />
        ))}
      </div>
    );
  }

  if (error || !po) {
    return (
      <div className="text-body-sm text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5">
        {error || 'Purchase order not found.'}
      </div>
    );
  }

  const canReceive = !['Received', 'Cancelled'].includes(po.status);
  const canMarkOrdered = po.status === 'Draft';
  const canCancel = po.status === 'Draft' || po.status === 'Ordered';

  return (
    <div>
      <button
        onClick={() => navigate('/purchase-orders')}
        className="text-body-sm text-[#1C8A93] font-semibold mb-4"
      >
        ← Back to purchase orders
      </button>

      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="font-display text-lg font-bold text-ink mb-1 font-mono">{po.po_number}</h2>
          <POStatusPill status={po.status} />
        </div>
        <div className="flex gap-2">
          {canMarkOrdered && (
            <button
              onClick={() => handleStatus('Ordered')}
              disabled={statusSubmitting}
              className="px-4 py-2.5 rounded-[10px] border border-border bg-white text-body-sm font-semibold disabled:opacity-60"
            >
              Mark as Ordered
            </button>
          )}
          {canCancel && (
            <button
              onClick={() => handleStatus('Cancelled')}
              disabled={statusSubmitting}
              className="px-4 py-2.5 rounded-[10px] border border-border bg-white text-body-sm font-semibold text-[#9C4326] disabled:opacity-60"
            >
              Cancel
            </button>
          )}
          {canReceive && (
            <button
              onClick={() => setReceiveOpen(true)}
              className="px-4 py-2.5 rounded-[10px] text-white text-body-sm font-semibold"
              style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
            >
              Receive
            </button>
          )}
        </div>
      </div>

      {po.notes && (
        <div className="surface-card rounded-[18px] p-4 mb-5">
          <p className="text-caption uppercase tracking-wider text-ink-soft mb-1">Notes</p>
          <p className="text-body-sm text-ink">{po.notes}</p>
        </div>
      )}

      <div className="surface-card rounded-[18px] p-5">
        <h4 className="font-display text-sm font-bold text-ink mb-3">Items</h4>
        {!po.items || po.items.length === 0 ? (
          <p className="text-body-sm text-ink-soft">No items on this purchase order.</p>
        ) : (
          <div className="table-scroll">
            <table className="w-full border-collapse">
            <thead>
            <tr>
            {['Material', 'Ordered', 'Received', 'Remaining', 'Unit cost'].map((h) => (
            <th
            key={h}
            className="text-left text-caption uppercase tracking-wider text-th-label pb-2.5 border-b border-border"
            >
            {h}
            </th>
            ))}
            </tr>
            </thead>
            <tbody>
            {po.items.map((it) => (
            <tr key={it.id}>
            <td className="p-3 border-b border-border text-body-sm font-semibold">
            Material #{it.material_id}
            </td>
            <td className="p-3 border-b border-border text-body-sm">{Number(it.quantity_ordered)}</td>
            <td className="p-3 border-b border-border text-body-sm">{Number(it.quantity_received)}</td>
            <td className="p-3 border-b border-border text-body-sm">
            {Number(it.quantity_ordered) - Number(it.quantity_received)}
            </td>
            <td className="p-3 border-b border-border text-body-sm">${Number(it.unit_cost).toFixed(2)}</td>
            </tr>
            ))}
            </tbody>
            </table>
          </div>
        )}
      </div>

      <ReceivePOModal open={receiveOpen} purchaseOrder={po} onClose={() => setReceiveOpen(false)} onReceived={load} />
    </div>
  );
}
