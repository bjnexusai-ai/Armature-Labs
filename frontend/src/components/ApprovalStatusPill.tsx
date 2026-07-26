import type { ApprovalStatus } from '../lib/caseTypes';
import { APPROVAL_STATUS_COLORS } from '../lib/statusColors';

const LABELS: Record<ApprovalStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Changes requested',
};

export function ApprovalStatusPill({ status }: { status: ApprovalStatus }) {
  const colors = APPROVAL_STATUS_COLORS[status];
  return (
    <span className="status-pill" style={{ background: colors.bg, color: colors.text }}>
      {LABELS[status]}
    </span>
  );
}
