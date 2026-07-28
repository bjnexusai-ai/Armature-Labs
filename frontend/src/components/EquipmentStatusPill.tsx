import type { EquipmentStatus } from '../lib/equipmentTypes';
import { EQUIPMENT_STATUS_COLORS } from '../lib/statusColors';

export function EquipmentStatusPill({ status }: { status: EquipmentStatus }) {
  const colors = EQUIPMENT_STATUS_COLORS[status];
  return (
    <span className="status-pill" style={{ background: colors.bg, color: colors.text }}>
      {status}
    </span>
  );
}
