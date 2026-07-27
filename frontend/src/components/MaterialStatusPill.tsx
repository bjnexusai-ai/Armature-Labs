import type { MaterialStatus } from '../lib/caseTypes';
import { MATERIAL_STATUS_COLORS } from '../lib/statusColors';

export function MaterialStatusPill({ status }: { status: MaterialStatus }) {
  const colors = MATERIAL_STATUS_COLORS[status] ?? MATERIAL_STATUS_COLORS.OK;
  return (
    <span className="status-pill" style={{ background: colors.bg, color: colors.text }}>
      {status}
    </span>
  );
}
