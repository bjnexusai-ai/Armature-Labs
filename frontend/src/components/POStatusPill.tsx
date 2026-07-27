import type { PurchaseOrderStatus } from '../lib/caseTypes';
import { PO_STATUS_COLORS } from '../lib/statusColors';

export function POStatusPill({ status }: { status: PurchaseOrderStatus }) {
  const colors = PO_STATUS_COLORS[status];
  return (
    <span className="status-pill" style={{ background: colors.bg, color: colors.text }}>
      {status}
    </span>
  );
}
