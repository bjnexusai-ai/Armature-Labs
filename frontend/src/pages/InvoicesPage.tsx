import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, listInvoices } from '../lib/api';
import type { InvoiceListRow } from '../lib/caseTypes';
import { useAuth } from '../context/AuthContext';
import { InvoiceStatusPill } from '../components/InvoiceStatusPill';
import { NewInvoiceModal } from '../components/NewInvoiceModal';
import { parseFlexibleDate } from '../lib/dateUtils';
import { isManagerRole } from '../lib/permissions';

// Role-aware by design, not by branching here: GET /api/billing/invoices
// itself branches server-side on req.user.role (internal Owner/Office
// Manager see everyone's invoices; dentist_client sees only their own
// practice's, gated on can_view_invoices) — confirmed against
// billing.controller.js's listInvoices. This page just renders whatever
// comes back from the one endpoint either way.
export function InvoicesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [invoices, setInvoices] = useState<InvoiceListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newInvoiceOpen, setNewInvoiceOpen] = useState(false);

  // Creation is Owner/Office Manager only server-side (requireBillingAccess)
  // — this hides the button for everyone else, including portal users who'd
  // get a 403 either way. UI convenience only, not the real enforcement.
  const canCreate = isManagerRole(user);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    listInvoices()
      .then((res) => setInvoices(res.invoices))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Could not load invoices.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="font-display text-lg font-bold text-ink mb-1">Invoices</h2>
          <p className="text-sm text-ink-soft">
            {user?.role === 'dentist_client'
              ? 'Invoices for your practice.'
              : 'All practice invoices, most recent first.'}
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setNewInvoiceOpen(true)}
            className="px-4 py-2.5 rounded-[10px] text-white text-[13px] font-semibold"
            style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
          >
            + New invoice
          </button>
        )}
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
        ) : invoices.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="3.5" y="5" width="17" height="14" rx="2" />
              <path d="M3.5 9.5h17M7 14h4" />
            </svg>
            <h4>No invoices yet</h4>
            <p>Nothing has been billed here yet.</p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Invoice #', 'Status', 'Subtotal', 'Paid', 'Balance', 'Due', 'Created', ''].map((h) => (
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
              {invoices.map((inv) => {
                const balance = Number(inv.subtotal) - Number(inv.amount_paid);
                return (
                  <tr
                    key={inv.id}
                    className="hover:bg-page-bg-top transition-colors cursor-pointer"
                    onClick={() => navigate(`/invoices/${inv.id}`)}
                  >
                    <td className="p-3 border-b border-border font-mono text-[12.5px] text-ink-soft">
                      {inv.invoice_number}
                    </td>
                    <td className="p-3 border-b border-border">
                      <InvoiceStatusPill status={inv.status} />
                    </td>
                    <td className="p-3 border-b border-border text-[13px]">${Number(inv.subtotal).toFixed(2)}</td>
                    <td className="p-3 border-b border-border text-[13px]">
                      ${Number(inv.amount_paid).toFixed(2)}
                    </td>
                    <td className="p-3 border-b border-border text-[13px] font-semibold">
                      ${balance.toFixed(2)}
                    </td>
                    <td className="p-3 border-b border-border text-[13px] text-ink-soft">
                      {inv.due_date
                        ? (parseFlexibleDate(inv.due_date)?.toLocaleDateString() ?? inv.due_date)
                        : 'No due date'}
                    </td>
                    <td className="p-3 border-b border-border text-[13px] text-ink-soft">
                      {new Date(inv.created_at).toLocaleDateString()}
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

      <NewInvoiceModal open={newInvoiceOpen} onClose={() => setNewInvoiceOpen(false)} onCreated={load} />
    </div>
  );
}
