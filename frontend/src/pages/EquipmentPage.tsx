import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, listEquipment } from '../lib/api';
import type { Equipment, EquipmentStatus } from '../lib/equipmentTypes';
import { useAuth } from '../context/AuthContext';
import { EquipmentStatusPill } from '../components/EquipmentStatusPill';
import { NewEquipmentModal } from '../components/NewEquipmentModal';

const STATUS_FILTERS: EquipmentStatus[] = ['Active', 'Under Maintenance', 'Retired'];

// Confirmed against equipment.routes.js — reads are requireInternal (no
// dentist_client access at all), catalog writes are requireManagerRole.
// Page is reachable via navConfig's roles gate (owner/office_manager/
// assistant_technician/designer), mirrored server-side.
export function EquipmentPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canCreate = user?.role === 'owner' || user?.role === 'office_manager';

  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [statusFilter, setStatusFilter] = useState<EquipmentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    listEquipment(statusFilter ?? undefined)
      .then((res) => setEquipment(res.equipment))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load equipment.'))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="font-display text-lg font-bold text-ink mb-1">Equipment</h2>
          <p className="text-sm text-ink-soft">Machines, status, and maintenance history.</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setNewOpen(true)}
            className="px-4 py-2.5 rounded-[10px] text-white text-[13px] font-semibold"
            style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
          >
            + New equipment
          </button>
        )}
      </div>

      <div className="range-toggle mb-4 flex-wrap">
        <button className={`range-btn ${statusFilter === null ? 'active' : ''}`} onClick={() => setStatusFilter(null)}>
          All
        </button>
        {STATUS_FILTERS.map((s) => (
          <button key={s} className={`range-btn ${statusFilter === s ? 'active' : ''}`} onClick={() => setStatusFilter(s)}>
            {s}
          </button>
        ))}
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
        ) : equipment.length === 0 ? (
          <div className="empty-state">
            <h4>No equipment yet</h4>
            <p>Nothing has been added to the catalog yet.</p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Name', 'Type', 'Serial #', 'Next maintenance due', 'Status', ''].map((h) => (
                  <th key={h} className="text-left text-[11px] uppercase tracking-wider text-ink-soft pb-2.5 border-b border-border">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {equipment.map((e) => (
                <tr
                  key={e.id}
                  className="hover:bg-page-bg-top transition-colors cursor-pointer"
                  onClick={() => navigate(`/equipment/${e.id}`)}
                >
                  <td className="p-3 border-b border-border text-[13px] font-semibold">{e.name}</td>
                  <td className="p-3 border-b border-border text-[13px] text-ink-soft">{e.equipment_type}</td>
                  <td className="p-3 border-b border-border text-[13px] text-ink-soft font-mono">{e.serial_number || '—'}</td>
                  <td className="p-3 border-b border-border text-[13px] text-ink-soft">
                    {e.next_maintenance_due_date ? new Date(`${e.next_maintenance_due_date}T00:00:00`).toLocaleDateString() : '—'}
                  </td>
                  <td className="p-3 border-b border-border">
                    <EquipmentStatusPill status={e.status} />
                  </td>
                  <td className="p-3 border-b border-border text-right text-[12px] text-[#1C8A93] font-semibold">View →</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <NewEquipmentModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={load} />
    </div>
  );
}
