import type { InvoiceStatus } from '../lib/caseTypes';
import { INVOICE_STATUS_COLORS } from '../lib/statusColors';

export function InvoiceStatusPill({ status }: { status: InvoiceStatus }) {
  const colors = INVOICE_STATUS_COLORS[status];
  return (
    <span className="status-pill" style={{ background: colors.bg, color: colors.text }}>
      {status}
    </span>
  );
}
