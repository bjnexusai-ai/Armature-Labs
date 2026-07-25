import type { CaseStatus } from '../lib/caseTypes';
import { STATUS_COLORS } from '../lib/statusColors';

export function StatusPill({ status }: { status: CaseStatus }) {
  const colors = STATUS_COLORS[status];
  return (
    <span
      className="status-pill"
      style={{ background: colors.bg, color: colors.text }}
    >
      {status}
    </span>
  );
}
