import { useEffect, useState } from 'react';
import { ApiError, createShipment, listShipments } from '../lib/api';
import type { Shipment } from '../lib/caseTypes';
import { ShipmentStatusPill } from './ShipmentStatusPill';
import { ShipmentStatusModal } from './ShipmentStatusModal';
import { useToast } from '../context/ToastContext';

// Shipments (Frontend Session 5) — confirmed directly against
// backend/src/controllers/fulfillment.controller.js. Creation and status
// updates are internal-only (gated by isInternal, mirroring requireInternal
// server-side); reads render for every role since the route isn't
// requireInternal — the dental office has a legitimate interest in
// tracking/carrier info for their own case.
export function ShipmentsPanel({ caseId, isInternal }: { caseId: number; isInternal: boolean }) {
  const { showToast } = useToast();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingShipment, setEditingShipment] = useState<Shipment | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    listShipments(caseId)
      .then((res) => setShipments(res.shipments))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load shipments.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, [caseId]);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      await createShipment(caseId, {});
      showToast('Shipment created');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create a shipment.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      {isInternal && (
        <div className="flex items-center justify-between mb-3.5">
          <span className="text-[12.5px] text-ink-soft">
            Creation is explicit, not auto-fired off a case status change — a case can have more than one shipment (e.g. a reshipment).
          </span>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="btn-primary h-9 px-4 rounded-[9px] font-semibold text-[13px] disabled:opacity-60 shrink-0 ml-3"
          >
            {creating ? 'Creating…' : '+ New shipment'}
          </button>
        </div>
      )}

      {error && (
        <div className="text-[12.5px] text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5 mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2.5">
          <div className="skeleton h-20 rounded-[14px]" />
          <div className="skeleton h-20 rounded-[14px]" />
        </div>
      ) : shipments.length === 0 ? (
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M3.5 8 12 3.5 20.5 8 12 12.5 3.5 8Z" />
            <path d="M3.5 8v8L12 20.5 20.5 16V8" />
            <path d="M12 12.5V20.5" />
          </svg>
          <h4>No shipments yet</h4>
          <p>{isInternal ? 'Create one once the case is ready to go out.' : 'Shipment tracking for this case will show up here.'}</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {shipments.map((s) => (
            <div key={s.id} className="surface-card rounded-[14px] p-4 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[13px] font-semibold text-ink">Shipment #{s.id}</span>
                  <ShipmentStatusPill status={s.status} />
                </div>
                <div className="text-[12.5px] text-ink-soft space-x-3">
                  <span>{s.carrier || 'Carrier not set'}</span>
                  <span className="font-mono">{s.tracking_number || 'No tracking number'}</span>
                </div>
                <div className="text-[11px] text-ink-soft mt-1 space-x-3">
                  {s.shipped_at && <span>Shipped {new Date(s.shipped_at).toLocaleDateString()}</span>}
                  {s.delivered_at && <span>Delivered {new Date(s.delivered_at).toLocaleDateString()}</span>}
                </div>
              </div>
              {isInternal && (
                <button
                  onClick={() => setEditingShipment(s)}
                  className="h-9 px-3.5 rounded-[9px] border border-border bg-white font-semibold text-[12.5px] cursor-pointer hover:bg-page-bg-top shrink-0"
                >
                  Update
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {isInternal && (
        <ShipmentStatusModal shipment={editingShipment} onClose={() => setEditingShipment(null)} onUpdated={load} />
      )}
    </div>
  );
}
