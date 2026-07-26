import type { WarrantyClaimStatus } from '../lib/caseTypes';
import { WARRANTY_STATUS_COLORS } from '../lib/statusColors';

export function WarrantyStatusPill({ status }: { status: WarrantyClaimStatus }) {
  const colors = WARRANTY_STATUS_COLORS[status];
  return (
    <span className="status-pill" style={{ background: colors.bg, color: colors.text }}>
      {status}
    </span>
  );
}
