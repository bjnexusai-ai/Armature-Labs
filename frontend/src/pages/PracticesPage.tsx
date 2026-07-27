import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, listPractices } from '../lib/api';
import type { Practice } from '../lib/caseTypes';

// GET /api/practices already existed from Session 2 (not requireInternal —
// server-side scoped so a dentist_client only ever sees their own practice)
// but this nav entry itself is Owner/Office Manager only per navConfig,
// since the CRM actions on the detail page (contracts/notes) are
// internal-only regardless (requireManagerRole in accounts.controller.js).
export function PracticesPage() {
  const navigate = useNavigate();
  const [practices, setPractices] = useState<Practice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    listPractices()
      .then((res) => setPractices(res.practices))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load practices.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="mb-5">
        <h2 className="font-display text-lg font-bold text-ink mb-1">Practices</h2>
        <p className="text-sm text-ink-soft">Dentist practices and their account details.</p>
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
        ) : practices.length === 0 ? (
          <div className="empty-state">
            <h4>No practices yet</h4>
            <p>Practices will show up here once added.</p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Name', 'City', 'State', 'Phone', 'Status', ''].map((h) => (
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
              {practices.map((p) => (
                <tr
                  key={p.id}
                  className="hover:bg-page-bg-top transition-colors cursor-pointer"
                  onClick={() => navigate(`/practices/${p.id}`)}
                >
                  <td className="p-3 border-b border-border text-[13px] font-semibold">{p.practice_name}</td>
                  <td className="p-3 border-b border-border text-[13px] text-ink-soft">{p.city || '—'}</td>
                  <td className="p-3 border-b border-border text-[13px] text-ink-soft">{p.state || '—'}</td>
                  <td className="p-3 border-b border-border text-[13px] text-ink-soft">{p.phone || '—'}</td>
                  <td className="p-3 border-b border-border text-[13px] text-ink-soft">{p.status}</td>
                  <td className="p-3 border-b border-border text-right text-[12px] text-[#1C8A93] font-semibold">
                    View →
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
