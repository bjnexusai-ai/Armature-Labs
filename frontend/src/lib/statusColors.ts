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
