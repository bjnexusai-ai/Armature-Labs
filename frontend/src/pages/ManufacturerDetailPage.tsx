import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  ApiError,
  createConnectOnboardingLink,
  createPayout,
  getManufacturer,
  listPayouts,
  updateManufacturer,
} from '../lib/api';
import type { Manufacturer, ManufacturerPayout } from '../lib/caseTypes';
import { PAYOUT_STATUS_COLORS, CONNECT_STATUS_COLORS } from '../lib/statusColors';
import { useToast } from '../context/ToastContext';

export function ManufacturerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [manufacturer, setManufacturer] = useState<Manufacturer | null>(null);
  const [payouts, setPayouts] = useState<ManufacturerPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editContactName, setEditContactName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [onboardingLoading, setOnboardingLoading] = useState(false);

  const [payoutCaseId, setPayoutCaseId] = useState('');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutSubmitting, setPayoutSubmitting] = useState(false);
  const [payoutError, setPayoutError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    Promise.all([getManufacturer(id), listPayouts(id)])
      .then(([m, p]) => {
        setManufacturer(m.manufacturer);
        setPayouts(p.payouts);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load this manufacturer.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  function startEditing() {
    if (!manufacturer) return;
    setEditName(manufacturer.name);
    setEditContactName(manufacturer.contact_name || '');
    setEditEmail(manufacturer.email || '');
    setEditPhone(manufacturer.phone || '');
    setEditError(null);
    setEditing(true);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setEditError(null);
    setEditSubmitting(true);
    try {
      await updateManufacturer(id, {
        name: editName.trim() || undefined,
        contactName: editContactName.trim() || undefined,
        email: editEmail.trim() || undefined,
        phone: editPhone.trim() || undefined,
      });
      showToast('Manufacturer updated');
      setEditing(false);
      load();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Could not save changes.');
    } finally {
      setEditSubmitting(false);
    }
  }

  // Redirects to Stripe's hosted onboarding flow — return_url/refresh_url
  // are set server-side (see manufacturers.controller.js), both pointing
  // back at this same detail page.
  async function handleStartOnboarding() {
    if (!id) return;
    setOnboardingLoading(true);
    try {
      const res = await createConnectOnboardingLink(id);
      window.location.href = res.onboardingLink.url;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not start Stripe Connect onboarding.');
      setOnboardingLoading(false);
    }
  }

  async function handleCreatePayout(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setPayoutError(null);

    const amount = Number(payoutAmount);
    if (!amount || amount <= 0) {
      setPayoutError('Enter a payout amount greater than 0.');
      return;
    }

    setPayoutSubmitting(true);
    try {
      await createPayout(id, {
        amount,
        caseId: payoutCaseId ? Number(payoutCaseId) : undefined,
      });
      showToast('Payout sent');
      setPayoutCaseId('');
      setPayoutAmount('');
      load();
    } catch (err) {
      if (err instanceof ApiError) {
        // 402 still carries a Failed payout row in the body — merge it in
        // so it shows up in the list, not just an error toast, per
        // payouts.controller.js's own comment on why it does this.
        const body = err.body as { payout?: ManufacturerPayout } | undefined;
        if (body?.payout) {
          setPayouts((prev) => [body.payout as ManufacturerPayout, ...prev]);
        }
        setPayoutError(err.message);
      } else {
        setPayoutError('Could not create the payout.');
      }
    } finally {
      setPayoutSubmitting(false);
    }
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

  if (error || !manufacturer) {
    return (
      <div className="surface-card rounded-[18px] p-5">
        <div className="text-body-sm text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5 mb-4">
          {error || 'Manufacturer not found.'}
        </div>
        <button
          onClick={() => navigate('/manufacturers')}
          className="px-3 py-1.5 rounded-md border border-border text-xs font-semibold hover:bg-page-bg-top"
        >
          Back to manufacturers
        </button>
      </div>
    );
  }

  const connectPill = manufacturer.stripe_connected_account_id
    ? CONNECT_STATUS_COLORS[manufacturer.connect_status] || CONNECT_STATUS_COLORS.Onboarding
    : { bg: 'var(--color-badge-tan-bg)', text: 'var(--color-badge-tan)' };
  const connectLabel = manufacturer.stripe_connected_account_id ? manufacturer.connect_status : 'Not started';

  return (
    <div>
      <button
        onClick={() => navigate('/manufacturers')}
        className="text-body-sm font-semibold text-[#1C8A93] hover:underline mb-3"
      >
        ← Back to manufacturers
      </button>

      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="font-display text-lg font-bold text-ink mb-1">{manufacturer.name}</h2>
          <div className="flex items-center gap-2">
            <span className="status-pill" style={{ background: connectPill.bg, color: connectPill.text }}>
              {connectLabel}
            </span>
            <span className="text-xs text-ink-soft font-mono">{manufacturer.country}</span>
          </div>
        </div>
        {!editing && (
          <button
            onClick={startEditing}
            className="px-4 py-2.5 rounded-[10px] border border-border text-body-sm font-semibold hover:bg-page-bg-top"
          >
            Edit
          </button>
        )}
      </div>

      <div className="surface-card rounded-[18px] p-5 mb-5">
        {editing ? (
          <form onSubmit={handleSaveEdit}>
            {editError && (
              <div className="text-body-sm text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5 mb-4">
                {editError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 mb-3.5">
              <div>
                <label className="block text-body-sm font-semibold text-ink mb-1.5">Name</label>
                <input className="form-input" value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div>
                <label className="block text-body-sm font-semibold text-ink mb-1.5">Contact name</label>
                <input
                  className="form-input"
                  value={editContactName}
                  onChange={(e) => setEditContactName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-body-sm font-semibold text-ink mb-1.5">Email</label>
                <input className="form-input" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
              </div>
              <div>
                <label className="block text-body-sm font-semibold text-ink mb-1.5">Phone</label>
                <input className="form-input" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
              </div>
            </div>
            <p className="text-caption text-ink-soft mb-4">
              Country can't be changed here — it's fixed to the Stripe Connect account's country once
              onboarding starts.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-4 py-2.5 rounded-[10px] border border-border text-body-sm font-semibold hover:bg-page-bg-top"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editSubmitting}
                className="px-4 py-2.5 rounded-[10px] text-white text-body-sm font-semibold disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
              >
                {editSubmitting ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-2 gap-4 text-body-sm">
            <div>
              <div className="text-caption uppercase tracking-wider text-ink-soft mb-1">Contact</div>
              <div className="text-ink">{manufacturer.contact_name || '—'}</div>
            </div>
            <div>
              <div className="text-caption uppercase tracking-wider text-ink-soft mb-1">Email</div>
              <div className="text-ink">{manufacturer.email || '—'}</div>
            </div>
            <div>
              <div className="text-caption uppercase tracking-wider text-ink-soft mb-1">Phone</div>
              <div className="text-ink">{manufacturer.phone || '—'}</div>
            </div>
            <div>
              <div className="text-caption uppercase tracking-wider text-ink-soft mb-1">Added</div>
              <div className="text-ink">{new Date(manufacturer.created_at).toLocaleDateString()}</div>
            </div>
          </div>
        )}
      </div>

      <div className="surface-card rounded-[18px] p-5 mb-5">
        <h3 className="font-display text-body-lg font-bold text-ink mb-3">Stripe Connect</h3>
        {manufacturer.stripe_connected_account_id ? (
          <>
            <p className="text-body-sm text-ink-soft mb-3">
              Connected account: <span className="font-mono text-ink">{manufacturer.stripe_connected_account_id}</span>
              {' — '}
              {manufacturer.connect_status === 'Onboarding'
                ? 'onboarding started but not yet confirmed complete.'
                : manufacturer.connect_status}
            </p>
            {manufacturer.connect_status === 'Onboarding' && (
              <button
                onClick={handleStartOnboarding}
                disabled={onboardingLoading}
                className="px-4 py-2.5 rounded-[10px] border border-border text-body-sm font-semibold hover:bg-page-bg-top disabled:opacity-60"
              >
                {onboardingLoading ? 'Redirecting…' : 'Resume onboarding'}
              </button>
            )}
          </>
        ) : (
          <>
            <p className="text-body-sm text-ink-soft mb-3">
              No Stripe Connect account yet — payouts to this manufacturer can't be sent until onboarding
              is complete.
            </p>
            <button
              onClick={handleStartOnboarding}
              disabled={onboardingLoading}
              className="px-4 py-2.5 rounded-[10px] text-white text-body-sm font-semibold disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
            >
              {onboardingLoading ? 'Redirecting…' : 'Start Stripe Connect onboarding'}
            </button>
          </>
        )}
      </div>

      <div className="surface-card rounded-[18px] p-5 mb-5">
        <h3 className="font-display text-body-lg font-bold text-ink mb-3">Send a payout</h3>
        {!manufacturer.stripe_connected_account_id && (
          <p className="text-body-sm text-ink-soft mb-3">
            Complete Stripe Connect onboarding above before sending a payout.
          </p>
        )}
        {payoutError && (
          <div className="text-body-sm text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5 mb-3">
            {payoutError}
          </div>
        )}
        <form onSubmit={handleCreatePayout} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-body-sm font-semibold text-ink mb-1.5">Case ID (optional)</label>
            <input
              className="form-input w-28"
              type="number"
              min={1}
              value={payoutCaseId}
              onChange={(e) => setPayoutCaseId(e.target.value)}
              disabled={!manufacturer.stripe_connected_account_id}
            />
          </div>
          <div>
            <label className="block text-body-sm font-semibold text-ink mb-1.5">Amount (USD)</label>
            <input
              className="form-input w-32"
              type="number"
              min={0.01}
              step="0.01"
              value={payoutAmount}
              onChange={(e) => setPayoutAmount(e.target.value)}
              disabled={!manufacturer.stripe_connected_account_id}
            />
          </div>
          <button
            type="submit"
            disabled={payoutSubmitting || !manufacturer.stripe_connected_account_id}
            className="px-4 py-2.5 rounded-[10px] text-white text-body-sm font-semibold disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
          >
            {payoutSubmitting ? 'Sending…' : 'Send payout'}
          </button>
        </form>
      </div>

      <div className="surface-card rounded-[18px] p-5">
        <h3 className="font-display text-body-lg font-bold text-ink mb-3">Payout history</h3>
        {payouts.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 8v4l2.5 2.5" />
            </svg>
            <p>No payouts sent yet.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="w-full border-collapse">
            <thead>
            <tr>
            {['Date', 'Case', 'Amount', 'Status', 'Transfer'].map((h) => (
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
            {payouts.map((p) => (
            <tr key={p.id}>
            <td className="p-3 border-b border-border text-body-sm text-ink-soft">
            {new Date(p.created_at).toLocaleDateString()}
            </td>
            <td className="p-3 border-b border-border text-body-sm">
            {p.case_id ? (
            <button
            onClick={() => navigate(`/cases/${p.case_id}`)}
            className="font-mono text-[#1C8A93] hover:underline"
            >
            #{p.case_id}
            </button>
            ) : (
            '—'
            )}
            </td>
            <td className="p-3 border-b border-border text-body-sm font-semibold">
            ${Number(p.amount).toFixed(2)} {p.currency.toUpperCase()}
            </td>
            <td className="p-3 border-b border-border text-body-sm">
            <span
            className="status-pill"
            style={{ background: PAYOUT_STATUS_COLORS[p.status].bg, color: PAYOUT_STATUS_COLORS[p.status].text }}
            >
            {p.status}
            </span>
            </td>
            <td className="p-3 border-b border-border text-body-sm font-mono text-ink-soft">
            {p.stripe_transfer_id || '—'}
            </td>
            </tr>
            ))}
            </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
