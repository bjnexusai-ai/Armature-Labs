import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, getInvoice } from '../lib/api';
import type { InvoiceDetail } from '../lib/caseTypes';
import { useAuth } from '../context/AuthContext';
import { InvoiceStatusPill } from '../components/InvoiceStatusPill';
import { RecordPaymentModal } from '../components/RecordPaymentModal';

export function InvoiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  // Recording a payment is Owner/Office Manager only server-side
  // (requireBillingAccess on POST /invoices/:id/payments) — hides the
  // action for portal viewers, who'd otherwise get a 403.
  const canRecordPayment = user?.role === 'owner' || user?.role === 'office_manager';

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    getInvoice(id)
      .then((res) => setInvoice(res.invoice))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Could not load this invoice.');
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="surface-card rounded-[18px] p-5 space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-11 rounded-lg" />
        ))}
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="surface-card rounded-[18px] p-5">
        <div className="text-[12.5px] text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5 mb-4">
          {error || 'Invoice not found.'}
        </div>
        <button
          onClick={() => navigate('/invoices')}
          className="px-3 py-1.5 rounded-md border border-border text-xs font-semibold hover:bg-page-bg-top"
        >
          Back to invoices
        </button>
      </div>
    );
  }

  const balance = Number(invoice.subtotal) - Number(invoice.amount_paid);

  return (
    <div>
      <button
        onClick={() => navigate('/invoices')}
        className="text-[12.5px] font-semibold text-[#1C8A93] hover:underline mb-3"
      >
        ← Back to invoices
      </button>

      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="font-display text-lg font-bold text-ink mb-1 font-mono">{invoice.invoice_number}</h2>
          <div className="flex items-center gap-2">
            <InvoiceStatusPill status={invoice.status} />
            <span className="text-xs text-ink-soft">
              Created {new Date(invoice.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
        {canRecordPayment && invoice.status !== 'Void' && invoice.status !== 'Paid' && (
          <button
            onClick={() => setPaymentModalOpen(true)}
            className="px-4 py-2.5 rounded-[10px] text-white text-[13px] font-semibold"
            style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
          >
            Mark as paid
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <div className="surface-card fade-in rounded-[18px] p-[18px_20px] flex items-center gap-3.5">
          <div
            className="w-11 h-11 rounded-[10px] flex items-center justify-center shrink-0"
            style={{ background: 'var(--color-badge-teal-bg)' }}
          >
            <span className="text-badge-teal text-lg">🧾</span>
          </div>
          <div>
            <div className="font-display font-bold text-[22px] leading-none tracking-[-0.01em] text-ink">
              ${Number(invoice.subtotal).toFixed(2)}
            </div>
            <div className="text-[12.5px] text-ink-soft mt-[3px] font-medium">Subtotal</div>
          </div>
        </div>
        <div className="surface-card fade-in rounded-[18px] p-[18px_20px] flex items-center gap-3.5">
          <div
            className="w-11 h-11 rounded-[10px] flex items-center justify-center shrink-0"
            style={{ background: 'var(--color-badge-green-bg)' }}
          >
            <span className="text-badge-green text-lg">✅</span>
          </div>
          <div>
            <div className="font-display font-bold text-[22px] leading-none tracking-[-0.01em] text-ink">
              ${Number(invoice.amount_paid).toFixed(2)}
            </div>
            <div className="text-[12.5px] text-ink-soft mt-[3px] font-medium">Amount paid</div>
          </div>
        </div>
        <div className="surface-card fade-in rounded-[18px] p-[18px_20px] flex items-center gap-3.5">
          <div
            className="w-11 h-11 rounded-[10px] flex items-center justify-center shrink-0"
            style={{ background: 'var(--color-badge-amber-bg)' }}
          >
            <span className="text-badge-amber text-lg">⏳</span>
          </div>
          <div>
            <div className="font-display font-bold text-[22px] leading-none tracking-[-0.01em] text-ink">
              ${balance.toFixed(2)}
            </div>
            <div className="text-[12.5px] text-ink-soft mt-[3px] font-medium">Balance due</div>
          </div>
        </div>
      </div>

      <div className="surface-card rounded-[18px] p-5 mb-5">
        <h3 className="font-display text-[15px] font-bold text-ink mb-3">Line items</h3>
        {invoice.lineItems.length === 0 ? (
          <p className="text-[13px] text-ink-soft">No line items.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Description', 'Case', 'Qty', 'Unit price', 'Total'].map((h) => (
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
              {invoice.lineItems.map((li) => (
                <tr key={li.id}>
                  <td className="p-3 border-b border-border text-[13px]">{li.description}</td>
                  <td className="p-3 border-b border-border text-[13px] text-ink-soft">
                    {li.case_id ? (
                      <button
                        onClick={() => navigate(`/cases/${li.case_id}`)}
                        className="font-mono text-[#1C8A93] hover:underline"
                      >
                        #{li.case_id}
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="p-3 border-b border-border text-[13px]">{li.quantity}</td>
                  <td className="p-3 border-b border-border text-[13px]">${Number(li.unit_price).toFixed(2)}</td>
                  <td className="p-3 border-b border-border text-[13px] font-semibold">
                    ${Number(li.line_total).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {invoice.notes && (
          <p className="text-[12.5px] text-ink-soft mt-3 pt-3 border-t border-border">
            <span className="font-semibold text-ink">Notes: </span>
            {invoice.notes}
          </p>
        )}
      </div>

      <div className="surface-card rounded-[18px] p-5">
        <h3 className="font-display text-[15px] font-bold text-ink mb-3">Payment timeline</h3>
        {invoice.payments.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 7.5v5l3 2" />
            </svg>
            <h4>No payments yet</h4>
            <p>No payments have been recorded against this invoice.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {invoice.payments.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border bg-page-bg-top"
              >
                <div>
                  <p className="text-[13px] font-semibold text-ink">
                    ${Number(p.amount).toFixed(2)} · {p.method}
                  </p>
                  {p.reference_note && <p className="text-[12px] text-ink-soft">{p.reference_note}</p>}
                </div>
                <span className="text-[12px] text-ink-soft">{new Date(p.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <RecordPaymentModal
        invoice={paymentModalOpen ? invoice : null}
        onClose={() => setPaymentModalOpen(false)}
        onDone={load}
      />
    </div>
  );
}
