import { useCallback, useEffect, useState } from 'react';
import { ApiError, listBookings, listEquipment, listShifts } from '../lib/api';
import type { EquipmentBooking, TechnicianShift, Equipment } from '../lib/equipmentTypes';
import { NewShiftModal } from '../components/NewShiftModal';
import { NewBookingModal } from '../components/NewBookingModal';

type Tab = 'shifts' | 'bookings';

/**
 * Confirmed against planning.controller.js before building: listShifts /
 * listBookings return a flat array ordered by starts_at, no date-range
 * params, no per-day grouping in the response. Per SESSION_7_PROMPT §1.2's
 * own instruction ("confirm... whether this is a calendar-style view or a
 * simple list before committing to a UI pattern; don't assume a calendar
 * widget is needed if the data doesn't support one cleanly yet") — this
 * is a simple chronological list, not a calendar grid. A calendar view
 * would need date-bucketing invented client-side with no backend signal
 * for it; a list matches what's actually there.
 *
 * Confirmed role gate: both routes sit at requireInternal with no extra
 * manager gate (planning.routes.js's own comment: "closer to day-to-day
 * scheduling than vendor/PO management"), so create actions are open to
 * any internal staff, not manager-restricted like Equipment's catalog
 * writes.
 */
export function SchedulingPage() {
  const [tab, setTab] = useState<Tab>('shifts');

  const [shifts, setShifts] = useState<TechnicianShift[]>([]);
  const [bookings, setBookings] = useState<EquipmentBooking[]>([]);
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([listShifts(), listBookings(), listEquipment()])
      .then(([s, b, e]) => {
        setShifts(s.shifts);
        setBookings(b.bookings);
        setEquipmentList(e.equipment);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load scheduling data.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const equipmentName = (id: number) => equipmentList.find((e) => e.id === id)?.name ?? `Equipment #${id}`;

  // Both lists are already ordered starts_at ASC server-side; split into
  // upcoming/past client-side purely for readability, not re-sorted.
  const now = new Date();
  const upcomingShifts = shifts.filter((s) => new Date(s.ends_at) >= now);
  const pastShifts = shifts.filter((s) => new Date(s.ends_at) < now);
  const upcomingBookings = bookings.filter((b) => new Date(b.ends_at) >= now);
  const pastBookings = bookings.filter((b) => new Date(b.ends_at) < now);

  return (
    <div>
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-ink mb-1">Scheduling</h2>
          <p className="text-sm text-ink-soft">Technician shifts and equipment bookings.</p>
        </div>
        <button
          onClick={() => (tab === 'shifts' ? setShiftModalOpen(true) : setBookingModalOpen(true))}
          className="px-4 py-2.5 rounded-[10px] text-white text-[13px] font-semibold shrink-0"
          style={{ background: 'linear-gradient(135deg,#1C8A93,#16A37A)' }}
        >
          + New {tab === 'shifts' ? 'shift' : 'booking'}
        </button>
      </div>

      <div className="range-toggle mb-4">
        <button className={`range-btn ${tab === 'shifts' ? 'active' : ''}`} onClick={() => setTab('shifts')}>
          Technician shifts
        </button>
        <button className={`range-btn ${tab === 'bookings' ? 'active' : ''}`} onClick={() => setTab('bookings')}>
          Equipment bookings
        </button>
      </div>

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
      ) : tab === 'shifts' ? (
        <ShiftTable title="Upcoming" rows={upcomingShifts} />
      ) : (
        <BookingTable title="Upcoming" rows={upcomingBookings} equipmentName={equipmentName} />
      )}

      {!loading && tab === 'shifts' && pastShifts.length > 0 && (
        <div className="mt-5">
          <ShiftTable title="Past" rows={pastShifts} muted />
        </div>
      )}
      {!loading && tab === 'bookings' && pastBookings.length > 0 && (
        <div className="mt-5">
          <BookingTable title="Past" rows={pastBookings} equipmentName={equipmentName} muted />
        </div>
      )}

      <NewShiftModal open={shiftModalOpen} onClose={() => setShiftModalOpen(false)} onCreated={load} />
      <NewBookingModal
        open={bookingModalOpen}
        equipmentList={equipmentList}
        onClose={() => setBookingModalOpen(false)}
        onCreated={load}
      />
    </div>
  );
}

function ShiftTable({ title, rows, muted }: { title: string; rows: TechnicianShift[]; muted?: boolean }) {
  return (
    <div className="surface-card rounded-[18px] p-5" style={{ opacity: muted ? 0.75 : 1 }}>
      <h4 className="font-display text-sm font-bold text-ink mb-3">{title}</h4>
      {rows.length === 0 ? (
        <div className="empty-state">
          <h4>No {title.toLowerCase()} shifts</h4>
          <p>Shifts will show up here once scheduled.</p>
        </div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['Technician ID', 'Starts', 'Ends', 'Notes'].map((h) => (
                <th key={h} className="text-left text-[11px] uppercase tracking-wider text-ink-soft pb-2.5 border-b border-border">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td className="p-3 border-b border-border text-[13px] font-semibold">#{s.technician_id}</td>
                <td className="p-3 border-b border-border text-[13px] text-ink-soft">{new Date(s.starts_at).toLocaleString()}</td>
                <td className="p-3 border-b border-border text-[13px] text-ink-soft">{new Date(s.ends_at).toLocaleString()}</td>
                <td className="p-3 border-b border-border text-[13px] text-ink-soft">{s.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function BookingTable({
  title,
  rows,
  equipmentName,
  muted,
}: {
  title: string;
  rows: EquipmentBooking[];
  equipmentName: (id: number) => string;
  muted?: boolean;
}) {
  return (
    <div className="surface-card rounded-[18px] p-5" style={{ opacity: muted ? 0.75 : 1 }}>
      <h4 className="font-display text-sm font-bold text-ink mb-3">{title}</h4>
      {rows.length === 0 ? (
        <div className="empty-state">
          <h4>No {title.toLowerCase()} bookings</h4>
          <p>Equipment bookings will show up here once scheduled.</p>
        </div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['Equipment', 'Case', 'Starts', 'Ends', 'Notes'].map((h) => (
                <th key={h} className="text-left text-[11px] uppercase tracking-wider text-ink-soft pb-2.5 border-b border-border">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <td className="p-3 border-b border-border text-[13px] font-semibold">{equipmentName(b.equipment_id)}</td>
                <td className="p-3 border-b border-border text-[13px] text-ink-soft">{b.case_id ? `#${b.case_id}` : '—'}</td>
                <td className="p-3 border-b border-border text-[13px] text-ink-soft">{new Date(b.starts_at).toLocaleString()}</td>
                <td className="p-3 border-b border-border text-[13px] text-ink-soft">{new Date(b.ends_at).toLocaleString()}</td>
                <td className="p-3 border-b border-border text-[13px] text-ink-soft">{b.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
