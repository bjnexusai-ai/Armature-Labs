import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ApiError, getEquipmentItem, listMaintenanceLogs, updateEquipmentStatus } from '../lib/api';
import type { Equipment, EquipmentStatus, MaintenanceLog } from '../lib/equipmentTypes';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { EquipmentStatusPill } from '../components/EquipmentStatusPill';
import { MaintenanceLogModal } from '../components/MaintenanceLogModal';
import { isManagerRole } from '../lib/permissions';

const STATUS_OPTIONS: EquipmentStatus[] = ['Active', 'Under Maintenance', 'Retired'];

export function EquipmentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  // Status change is requireManagerRole server-side (equipment.routes.js);
  // maintenance logging is open to any internal staff — same split as
  // Materials' Adjust-vs-Consume gating.
  const canChangeStatus = isManagerRole(user);

  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    Promise.all([getEquipmentItem(id), listMaintenanceLogs(id)])
      .then(([e, l]) => {
        setEquipment(e.equipment);
        setLogs(l.maintenanceLogs);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load this equipment.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleStatusChange(status: EquipmentStatus) {
    if (!equipment || status === equipment.status) return;
    setStatusUpdating(true);
    try {
      const res = await updateEquipmentStatus(equipment.id, { status });
      setEquipment(res.equipment);
      showToast(`Status updated to ${status}.`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not update status.');
    } finally {
      setStatusUpdating(false);
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

  if (error || !equipment) {
    return (
      <div className="text-body-sm text-[#9C4326] bg-[#FBEEEA] border border-[#EED0C4] rounded-xl px-3.5 py-2.5">
        {error || 'Equipment not found.'}
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => navigate('/equipment')} className="text-body-sm text-[#1C8A93] font-semibold mb-4">
        ← Back to equipment
      </button>

      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-ink mb-1">{equipment.name}</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <EquipmentStatusPill status={equipment.status} />
            <span className="text-sm text-ink-soft">{equipment.equipment_type}</span>
            {equipment.serial_number && <span className="text-sm text-ink-soft font-mono">· {equipment.serial_number}</span>}
          </div>
        </div>
        <button
          onClick={() => setLogModalOpen(true)}
          className="px-4 py-2.5 rounded-[10px] text-white text-body-sm font-semibold shrink-0"
          style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
        >
          Log maintenance
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="surface-card rounded-[18px] p-4">
          <p className="text-caption uppercase tracking-wider text-ink-soft mb-1">Next maintenance due</p>
          <p className="text-lg stat-value text-ink">
            {equipment.next_maintenance_due_date
              ? new Date(`${equipment.next_maintenance_due_date}T00:00:00`).toLocaleDateString()
              : 'Not scheduled'}
          </p>
        </div>
        <div className="surface-card rounded-[18px] p-4">
          <p className="text-caption uppercase tracking-wider text-ink-soft mb-2">Status</p>
          {canChangeStatus ? (
            <select
              className="form-input"
              value={equipment.status}
              disabled={statusUpdating}
              onChange={(e) => handleStatusChange(e.target.value as EquipmentStatus)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-lg stat-value text-ink">{equipment.status}</p>
          )}
        </div>
      </div>

      <div className="surface-card rounded-[18px] p-5">
        <h4 className="font-display text-sm font-bold text-ink mb-3">Maintenance log history</h4>
        {logs.length === 0 ? (
          <div className="empty-state">
            <h4>No maintenance logged yet</h4>
            <p>Routine service, repairs, and inspections will show up here.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="w-full border-collapse">
            <thead>
            <tr>
            {['Type', 'Notes', 'Next due', 'Logged'].map((h) => (
            <th key={h} className="text-left text-caption uppercase tracking-wider text-ink pb-2.5 border-b border-border">
            {h}
            </th>
            ))}
            </tr>
            </thead>
            <tbody>
            {logs.map((l) => (
            <tr key={l.id}>
            <td className="p-3 border-b border-border text-body-sm font-semibold">{l.log_type}</td>
            <td className="p-3 border-b border-border text-body-sm text-ink-soft">{l.notes || '—'}</td>
            <td className="p-3 border-b border-border text-body-sm text-ink-soft">
            {l.next_due_date ? new Date(`${l.next_due_date}T00:00:00`).toLocaleDateString() : '—'}
            </td>
            <td className="p-3 border-b border-border text-body-sm text-ink-soft">{new Date(l.performed_at).toLocaleString()}</td>
            </tr>
            ))}
            </tbody>
            </table>
          </div>
        )}
      </div>

      <MaintenanceLogModal open={logModalOpen} equipment={equipment} onClose={() => setLogModalOpen(false)} onLogged={load} />
    </div>
  );
}
