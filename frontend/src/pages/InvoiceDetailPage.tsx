import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { ApiError, createCheckoutSession, getInvoice } from '../lib/api';
import type { InvoiceDetail } from '../lib/caseTypes';
import { useAuth } from '../context/AuthContext';
import { InvoiceStatusPill } from '../components/InvoiceStatusPill';
import { RecordPaymentModal } from '../components/RecordPaymentModal';
import { parseFlexibleDate } from '../lib/dateUtils';
import { isManagerRole } from '../lib/permissions';

export function InvoiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Recording a payment is Owner/Office Manager only server-side
  // (requireBillingAccess on POST /invoices/:id/payments) — hides the
  // action for portal viewers, who'd otherwise get a 403.
  const canRecordPayment = isManagerRole(user);

  // Mirrors stripe.routes.js's requireCheckoutAccess exactly: internal
  // Owner/Office Manager, or a dentist_client with can_view_invoices=true.
  // Kept as a separate flag from canRecordPayment above (rather than
  // reusing it) because the server-side gate genuinely differs — a portal
  // user can pay their own invoice via Stripe but can never hit the manual
  // mark-paid endpoint.
  const canPayViaStripe =
    canRecordPayment || (user?.role === 'dentist_client' && user.canViewInvoices);

  // ?payment=success / ?payment=cancelled — Stripe's own redirect back from
  // success_url/cancel_url (see createCheckoutSession in
  // stripe.controller.js). The webhook that actually applies the payment is
  // async and may land a moment after this redirect, so "success" here
  // means Checkout was completed, not that amount_paid has updated yet.
  const paymentRedirect = searchParams.get('payment');

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

  async function handlePayNow() {
    if (!id) return;
    setCheckoutError(null);
    setCheckoutLoading(true);
    try {
      const res = await createCheckoutSession(id);
      window.location.href = res.checkoutSession.url;
    } catch (err) {
      setCheckoutError(err instanceof ApiError ? err.message : 'Could not start checkout.');
      setCheckoutLoading(false);
    }
  }

  function dismissPaymentBanner() {
    const next = new URLSearchParams(searchParams);
    next.delete('payment');
    setSearchParams(next, { replace: true });
  }

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
        <div className="text-body-sm text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5 mb-4">
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
        className="text-body-sm font-semibold text-[#1C8A93] hover:underline mb-3"
      >
        ← Back to invoices
      </button>

      {paymentRedirect === 'success' && (
        <div className="flex items-center justify-between text-body-sm text-[#1C6B4A] bg-[#E9F7F0] border border-[#C6E9D8] rounded-xl px-3.5 py-2.5 mb-4">
          <span>
            Payment submitted. It can take a few moments for the balance below to update once Stripe's webhook lands.
          </span>
          <button onClick={dismissPaymentBanner} className="font-semibold hover:underline shrink-0 ml-3">
            Dismiss
          </button>
        </div>
      )}
      {paymentRedirect === 'cancelled' && (
        <div className="flex items-center justify-between text-body-sm text-ink-soft bg-page-bg-top border border-border rounded-xl px-3.5 py-2.5 mb-4">
          <span>Checkout was cancelled — no payment was made.</span>
          <button onClick={dismissPaymentBanner} className="font-semibold hover:underline shrink-0 ml-3">
            Dismiss
          </button>
        </div>
      )}
      {checkoutError && (
        <div className="text-body-sm text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5 mb-4">
          {checkoutError}
        </div>
      )}

      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="font-display text-lg font-bold text-ink mb-1 font-mono">{invoice.invoice_number}</h2>
          <div className="flex items-center gap-2">
            <InvoiceStatusPill status={invoice.status} />
            <span className="text-xs text-ink-soft">
              Created {new Date(invoice.created_at).toLocaleDateString()}
            </span>
            {invoice.status === 'Paid' && invoice.paid_date && (
              <span className="text-xs text-ink-soft">
                · Paid {parseFlexibleDate(invoice.paid_date)?.toLocaleDateString() ?? invoice.paid_date}
              </span>
            )}
          </div>
        </div>
        {invoice.status !== 'Void' && invoice.status !== 'Paid' && (
          <div className="flex items-center gap-2">
            {canPayViaStripe && (
              <button
                onClick={handlePayNow}
                disabled={checkoutLoading}
                className="px-4 py-2.5 rounded-[10px] text-white text-body-sm font-semibold disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,#5B4CC4,#7A6CE0)' }}
              >
                {checkoutLoading ? 'Redirecting…' : 'Pay with card'}
              </button>
            )}
            {canRecordPayment && (
              <button
                onClick={() => setPaymentModalOpen(true)}
                className="px-4 py-2.5 rounded-[10px] text-white text-body-sm font-semibold"
                style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
              >
                Mark as paid
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <div className="surface-card fade-in rounded-[18px] p-[18px_20px] flex items-center gap-3.5">
          <div
            className="w-11 h-11 rounded-[10px] flex items-center justify-center shrink-0"
            style={{ background: 'var(--color-badge-teal-bg)' }}
          >
            <span className="text-badge-teal text-lg">🧾</span>
          </div>
          <div>
            <div className="font-display font-bold text-title leading-none tracking-[-0.01em] text-ink">
              ${Number(invoice.subtotal).toFixed(2)}
            </div>
            <div className="text-body-sm text-ink-soft mt-[3px] font-medium">Subtotal</div>
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
            <div className="font-display font-bold text-title leading-none tracking-[-0.01em] text-ink">
              ${Number(invoice.amount_paid).toFixed(2)}
            </div>
            <div className="text-body-sm text-ink-soft mt-[3px] font-medium">Amount paid</div>
          </div>
        </div>
        <div className="surface-card fade-in rounded-[18px] p-[18px_20px] flex items-center gap-3.5">
          <div
            className="w-11 h-11 rounded-[10px] flex items-center justify-center shrink-0"
            style={{ background: 'var(--color-badge-amber-bg)' }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-badge-amber">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 7.5V12l3 2" />
            </svg>
          </div>
          <div>
            <div className="font-display font-bold text-title leading-none tracking-[-0.01em] text-ink">
              ${balance.toFixed(2)}
            </div>
            <div className="text-body-sm text-ink-soft mt-[3px] font-medium">Balance due</div>
          </div>
        </div>
        <div className="surface-card fade-in rounded-[18px] p-[18px_20px] flex items-center gap-3.5">
          <div
            className="w-11 h-11 rounded-[10px] flex items-center justify-center shrink-0"
            style={{ background: 'var(--color-badge-teal-bg)' }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-badge-teal">
              <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
              <path d="M3.5 9.5h17M8 3v3M16 3v3" />
            </svg>
          </div>
          <div>
            <div className="font-display font-bold text-title leading-none tracking-[-0.01em] text-ink">
              {invoice.due_date
                ? (parseFlexibleDate(invoice.due_date)?.toLocaleDateString() ?? invoice.due_date)
                : 'No due date'}
            </div>
            <div className="text-body-sm text-ink-soft mt-[3px] font-medium">Due</div>
          </div>
        </div>
      </div>

      <div className="surface-card rounded-[18px] p-5 mb-5">
        <h3 className="font-display text-body-lg font-bold text-ink mb-3">Line items</h3>
        {invoice.lineItems.length === 0 ? (
          <p className="text-body-sm text-ink-soft">No line items.</p>
        ) : (
          <div className="table-scroll">
            <table className="w-full border-collapse">
            <thead>
            <tr>
            {['Description', 'Case', 'Qty', 'Unit price', 'Total'].map((h) => (
            <th
            key={h}
            className="text-left text-caption uppercase tracking-wider text-ink-soft pb-2.5 border-b border-border"
            >
            {h}
            </th>
            ))}
            </tr>
            </thead>
            <tbody>
            {invoice.lineItems.map((li) => (
            <tr key={li.id}>
            <td className="p-3 border-b border-border text-body-sm">{li.description}</td>
            <td className="p-3 border-b border-border text-body-sm text-ink-soft">
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
            <td className="p-3 border-b border-border text-body-sm">{li.quantity}</td>
            <td className="p-3 border-b border-border text-body-sm">${Number(li.unit_price).toFixed(2)}</td>
            <td className="p-3 border-b border-border text-body-sm font-semibold">
            ${Number(li.line_total).toFixed(2)}
            </td>
            </tr>
            ))}
            </tbody>
            </table>
          </div>
        )}
        {Number(invoice.tax_amount) > 0 && (
          <div className="mt-3 pt-3 border-t border-border space-y-1 text-body-sm">
            <div className="flex justify-between text-ink-soft">
              <span>Subtotal</span>
              <span>${Number(invoice.subtotal).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-ink-soft">
              <span>Tax</span>
              <span>${Number(invoice.tax_amount).toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-semibold text-ink">
              <span>Total</span>
              <span>${(Number(invoice.subtotal) + Number(invoice.tax_amount)).toFixed(2)}</span>
            </div>
          </div>
        )}
        {invoice.notes && (
          <p className="text-body-sm text-ink-soft mt-3 pt-3 border-t border-border">
            <span className="font-semibold text-ink">Notes: </span>
            {invoice.notes}
          </p>
        )}
      </div>

      <div className="surface-card rounded-[18px] p-5">
        <h3 className="font-display text-body-lg font-bold text-ink mb-3">Payment timeline</h3>
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
                  <p className="text-body-sm font-semibold text-ink">
                    ${Number(p.amount).toFixed(2)} · {p.method}
                  </p>
                  {p.reference_note && <p className="text-caption text-ink-soft">{p.reference_note}</p>}
                </div>
                <span className="text-caption text-ink-soft">{new Date(p.created_at).toLocaleString()}</span>
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
