import type { ShipmentStatus } from '../lib/caseTypes';
import { SHIPMENT_STATUS_COLORS } from '../lib/statusColors';

export function ShipmentStatusPill({ status }: { status: ShipmentStatus }) {
  const colors = SHIPMENT_STATUS_COLORS[status];
  return (
    <span className="status-pill" style={{ background: colors.bg, color: colors.text }}>
      {status}
    </span>
  );
}
