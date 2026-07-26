import type { CaseStatus } from './caseTypes';

/**
 * Color mapping for the 10-status lifecycle. The demo (index.html) only
 * ever styled 5 example statuses ad hoc — this extends that same palette to
 * all 10, reusing its exact precedents where one exists rather than
 * inventing new colors:
 *
 *   - "In design"                -> --pill-purple    (demo used this verbatim)
 *   - "Pending design approval"  -> --pill-mustard    (demo used this verbatim)
 *   - "Pending bisque approval"  -> --pill-purple     (demo's action-queue row
 *                                    used this exact pairing)
 *   - "Processing"               -> --badge-teal      (demo used this verbatim)
 *   - "Shipped" / "Shipped Out"  -> --pill-green       (demo used this verbatim)
 *   - "Delayed"                  -> --pill-red         (demo used this verbatim)
 *
 * Statuses with no demo precedent (documented decision, not a guess at new
 * colors — reuses only tokens already in the ported palette):
 *   - "Case Entered"   -> --badge-tan     (neutral start-of-lifecycle)
 *   - "Finalizing"     -> --badge-green   (deeper green than Shipped Out's
 *                          pill-green, signals "almost done")
 *   - "Delivered"      -> --pill-green + a checkmark dot (terminal, reuses
 *                          Shipped Out's family since both are "done" states)
 *   - "Case on Hold"   -> --badge-amber   (demo's amber token, unused
 *                          elsewhere for a pill, distinct from red/Delayed)
 */
export const STATUS_COLORS: Record<CaseStatus, { bg: string; text: string }> = {
  'Case Entered': { bg: 'var(--color-badge-tan-bg)', text: 'var(--color-badge-tan)' },
  'In Design': { bg: 'var(--color-pill-purple-bg)', text: 'var(--color-pill-purple-text)' },
  'Pending Design Approval': { bg: 'var(--color-pill-mustard-bg)', text: 'var(--color-pill-mustard-text)' },
  Processing: { bg: 'var(--color-badge-teal-bg)', text: 'var(--color-badge-teal)' },
  'Pending Bisque Approval': { bg: 'var(--color-pill-purple-bg)', text: 'var(--color-pill-purple-text)' },
  Finalizing: { bg: 'var(--color-badge-green-bg)', text: 'var(--color-badge-green)' },
  'Shipped Out': { bg: 'var(--color-pill-green-bg)', text: 'var(--color-pill-green-text)' },
  Delivered: { bg: 'var(--color-pill-green-bg)', text: 'var(--color-pill-green-text)' },
  'Case on Hold': { bg: 'var(--color-badge-amber-bg)', text: 'var(--color-badge-amber)' },
  Delayed: { bg: 'var(--color-pill-red-bg)', text: 'var(--color-pill-red-text)' },
};

export const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  Standard: { bg: 'var(--color-badge-tan-bg)', text: 'var(--color-badge-tan)' },
  Rush: { bg: 'var(--color-badge-amber-bg)', text: 'var(--color-badge-amber)' },
  Urgent: { bg: 'var(--color-pill-red-bg)', text: 'var(--color-pill-red-text)' },
};

// Approval status pill (Frontend Session 3) — reuses the same tokens as the
// case-status palette rather than inventing new ones: pending mirrors the
// mustard "awaiting action" tone already used for Pending Design/Bisque
// Approval, approved reuses the green "done" tone, rejected reuses red.
export const APPROVAL_STATUS_COLORS: Record<
  'pending' | 'approved' | 'rejected',
  { bg: string; text: string }
> = {
  pending: { bg: 'var(--color-pill-mustard-bg)', text: 'var(--color-pill-mustard-text)' },
  approved: { bg: 'var(--color-pill-green-bg)', text: 'var(--color-pill-green-text)' },
  rejected: { bg: 'var(--color-pill-red-bg)', text: 'var(--color-pill-red-text)' },
};

// Invoice status pill (Frontend Session 4) — reuses the same tokens rather
// than inventing new ones: Draft/Sent are neutral/awaiting-action (tan and
// mustard), Partially Paid reuses the amber "in progress" tone, Paid reuses
// the green "done" tone, Void reuses a muted neutral (not red — voiding an
// invoice isn't an error state the way Delayed/rejected are).
export const INVOICE_STATUS_COLORS: Record<
  'Draft' | 'Sent' | 'Partially Paid' | 'Paid' | 'Void',
  { bg: string; text: string }
> = {
  Draft: { bg: 'var(--color-badge-tan-bg)', text: 'var(--color-badge-tan)' },
  Sent: { bg: 'var(--color-pill-mustard-bg)', text: 'var(--color-pill-mustard-text)' },
  'Partially Paid': { bg: 'var(--color-badge-amber-bg)', text: 'var(--color-badge-amber)' },
  Paid: { bg: 'var(--color-pill-green-bg)', text: 'var(--color-pill-green-text)' },
  Void: { bg: 'var(--color-badge-tan-bg)', text: 'var(--color-badge-tan)' },
};

// Shipment status pill (Frontend Session 5) — reuses the same tokens as
// everywhere else rather than inventing new ones: Preparing mirrors the tan
// neutral "not moving yet" tone, Shipped reuses the exact --pill-green
// pairing the reference demo already used verbatim for "Shipped Out" case
// statuses (statusColors.ts's own precedent above), Delivered reuses the
// deeper --badge-green "done" tone to read as a step further than Shipped,
// Returned reuses red (an exception path, same family as Delayed).
export const SHIPMENT_STATUS_COLORS: Record<
  'Preparing' | 'Shipped' | 'Delivered' | 'Returned',
  { bg: string; text: string }
> = {
  Preparing: { bg: 'var(--color-badge-tan-bg)', text: 'var(--color-badge-tan)' },
  Shipped: { bg: 'var(--color-pill-green-bg)', text: 'var(--color-pill-green-text)' },
  Delivered: { bg: 'var(--color-badge-green-bg)', text: 'var(--color-badge-green)' },
  Returned: { bg: 'var(--color-pill-red-bg)', text: 'var(--color-pill-red-text)' },
};

// Warranty claim status pill (Frontend Session 5) — Open/Under Review reuse
// the mustard "awaiting action" tone (same as pending approvals/invoices
// above), Approved/Resolved reuse green "done", Denied reuses red, matching
// the exact same reasoning as INVOICE_STATUS_COLORS/APPROVAL_STATUS_COLORS.
export const WARRANTY_STATUS_COLORS: Record<
  'Open' | 'Under Review' | 'Approved' | 'Denied' | 'Resolved',
  { bg: string; text: string }
> = {
  Open: { bg: 'var(--color-pill-mustard-bg)', text: 'var(--color-pill-mustard-text)' },
  'Under Review': { bg: 'var(--color-badge-amber-bg)', text: 'var(--color-badge-amber)' },
  Approved: { bg: 'var(--color-pill-green-bg)', text: 'var(--color-pill-green-text)' },
  Denied: { bg: 'var(--color-pill-red-bg)', text: 'var(--color-pill-red-text)' },
  Resolved: { bg: 'var(--color-badge-green-bg)', text: 'var(--color-badge-green)' },
};
