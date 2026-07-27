import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, listPurchaseOrders, listVendors } from '../lib/api';
import type { PurchaseOrder, Vendor } from '../lib/caseTypes';
import { POStatusPill } from '../components/POStatusPill';
import { NewVendorModal } from '../components/NewVendorModal';
import { NewPurchaseOrderModal } from '../components/NewPurchaseOrderModal';

type Tab = 'purchaseOrders' | 'vendors';

// Confirmed against procurement.controller.js — entire router is
// requireInternal + requireManagerRole on every route including reads,
// stricter than Materials. navConfig gates this item to owner/office_manager
// already, matching that server-side reality.
export function PurchaseOrdersPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('purchaseOrders');

  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newVendorOpen, setNewVendorOpen] = useState(false);
  const [newPoOpen, setNewPoOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([listPurchaseOrders(), listVendors()])
      .then(([po, v]) => {
        setPurchaseOrders(po.purchaseOrders);
        setVendors(v.vendors);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load procurement data.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="font-display text-lg font-bold text-ink mb-1">Vendors &amp; Purchase Orders</h2>
          <p className="text-sm text-ink-soft">Manage vendors and track material orders.</p>
        </div>
        <button
          onClick={() => (tab === 'vendors' ? setNewVendorOpen(true) : setNewPoOpen(true))}
          className="px-4 py-2.5 rounded-[10px] text-white text-[13px] font-semibold"
          style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
        >
          {tab === 'vendors' ? '+ New vendor' : '+ New purchase order'}
        </button>
      </div>

      <div className="range-toggle mb-4">
        <button
          className={`range-btn ${tab === 'purchaseOrders' ? 'active' : ''}`}
          onClick={() => setTab('purchaseOrders')}
        >
          Purchase Orders
        </button>
        <button className={`range-btn ${tab === 'vendors' ? 'active' : ''}`} onClick={() => setTab('vendors')}>
          Vendors
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
        ) : tab === 'purchaseOrders' ? (
          purchaseOrders.length === 0 ? (
            <div className="empty-state">
              <h4>No purchase orders yet</h4>
              <p>Create one against a vendor to get started.</p>
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['PO #', 'Vendor', 'Status', 'Created', ''].map((h) => (
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
                {purchaseOrders.map((po) => {
                  const vendor = vendors.find((v) => v.id === po.vendor_id);
                  return (
                    <tr
                      key={po.id}
                      className="hover:bg-page-bg-top transition-colors cursor-pointer"
                      onClick={() => navigate(`/purchase-orders/${po.id}`)}
                    >
                      <td className="p-3 border-b border-border font-mono text-[12.5px] text-ink-soft">
                        {po.po_number}
                      </td>
                      <td className="p-3 border-b border-border text-[13px]">{vendor?.name ?? '—'}</td>
                      <td className="p-3 border-b border-border">
                        <POStatusPill status={po.status} />
                      </td>
                      <td className="p-3 border-b border-border text-[13px] text-ink-soft">
                        {new Date(po.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-3 border-b border-border text-right text-[12px] text-[#1C8A93] font-semibold">
                        View →
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        ) : vendors.length === 0 ? (
          <div className="empty-state">
            <h4>No vendors yet</h4>
            <p>Add a vendor before creating a purchase order.</p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Name', 'Contact', 'Email', 'Phone'].map((h) => (
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
              {vendors.map((v) => (
                <tr key={v.id}>
                  <td className="p-3 border-b border-border text-[13px] font-semibold">{v.name}</td>
                  <td className="p-3 border-b border-border text-[13px] text-ink-soft">{v.contact_name || '—'}</td>
                  <td className="p-3 border-b border-border text-[13px] text-ink-soft">{v.email || '—'}</td>
                  <td className="p-3 border-b border-border text-[13px] text-ink-soft">{v.phone || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <NewVendorModal open={newVendorOpen} onClose={() => setNewVendorOpen(false)} onCreated={load} />
      <NewPurchaseOrderModal open={newPoOpen} onClose={() => setNewPoOpen(false)} onCreated={load} />
    </div>
  );
}
