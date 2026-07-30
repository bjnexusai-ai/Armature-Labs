import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiError, listManufacturers } from '../lib/api';
import type { Manufacturer } from '../lib/caseTypes';
import { NewManufacturerModal } from '../components/NewManufacturerModal';

// GET /api/manufacturers is requireManagerRole at the router level (see
// manufacturers.routes.js) — no visibility branching needed here, unlike
// InvoicesPage; anyone who can reach this screen at all sees every row.
export function ManufacturersPage() {
  const navigate = useNavigate();

  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    listManufacturers()
      .then((res) => setManufacturers(res.manufacturers))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Could not load manufacturers.');
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
          <p className="text-sm text-ink-soft">Lab → manufacturer payouts via Stripe Connect</p>
        </div>
        <button
          onClick={() => setNewOpen(true)}
          className="px-4 py-2.5 rounded-[10px] text-white text-body-sm font-semibold"
          style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
        >
          + New manufacturer
        </button>
      </div>

      {error && (
        <div className="text-body-sm text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5 mb-4">
          {error}
        </div>
      )}

      <div className="surface-card rounded-[18px] p-5">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-11 rounded-lg" />
            ))}
          </div>
        ) : manufacturers.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M3.5 20.5V10l5-3v3l5-3v3l5-3v13.5Z" />
              <path d="M3.5 20.5h17" />
            </svg>
            <p>No manufacturers yet. Add one to start onboarding Stripe Connect payouts.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="w-full border-collapse">
            <thead>
            <tr>
            {['Name', 'Contact', 'Country', 'Connect status', ''].map((h) => (
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
            {manufacturers.map((m) => (
            <tr
            key={m.id}
            className="cursor-pointer hover:bg-page-bg-top"
            onClick={() => navigate(`/manufacturers/${m.id}`)}
            >
            <td className="p-3 border-b border-border text-body-sm font-semibold text-ink">{m.name}</td>
            <td className="p-3 border-b border-border text-body-sm text-ink-soft">
            {m.contact_name || m.email || m.phone || '—'}
            </td>
            <td className="p-3 border-b border-border text-body-sm font-mono text-ink-soft">{m.country}</td>
            <td className="p-3 border-b border-border text-body-sm">
            {m.stripe_connected_account_id ? (
            <span className="status-pill" style={{ background: 'var(--color-badge-amber-bg)', color: 'var(--color-badge-amber)' }}>
            {m.connect_status}
            </span>
            ) : (
            <span className="status-pill" style={{ background: 'var(--color-badge-tan-bg)', color: 'var(--color-badge-tan)' }}>
            Not started
            </span>
            )}
            </td>
            <td className="p-3 border-b border-border text-body-sm text-right text-[#1C8A93] font-semibold">
            View →
            </td>
            </tr>
            ))}
            </tbody>
            </table>
          </div>
        )}
      </div>

      <NewManufacturerModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={load} />
    </div>
  );
}
