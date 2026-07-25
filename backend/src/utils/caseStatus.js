/**
 * The 10-status case lifecycle state machine (gap #12 — authoritative over the
 * docx §11.3 mockup's 7-step tracker, which is workflow_stages seed data, a
 * separate concern handled by STATUS_TO_STAGE_NAME below).
 *
 * Rules (Session 2 build prompt):
 * - Strict forward adjacency only through the linear flow. No skipping, no
 *   direct backward movement (backward only ever happens via Hold/Delayed,
 *   or in a future session via a Request Changes approval action).
 * - 'Case on Hold' and 'Delayed' are exception states, enterable from ANY
 *   active linear status (not from 'Delivered' — terminal).
 * - Clearing an exception state reverts current_status to prior_status.
 * - 'Delivered' is terminal — no transitions of any kind once reached.
 */

const LINEAR_STATUSES = [
  'Case Entered',
  'In Design',
  'Pending Design Approval',
  'Processing',
  'Pending Bisque Approval',
  'Finalizing',
  'Shipped Out',
  'Delivered',
];

const EXCEPTION_STATUSES = ['Case on Hold', 'Delayed'];

const TERMINAL_STATUS = 'Delivered';

const ALL_STATUSES = [...LINEAR_STATUSES, ...EXCEPTION_STATUSES];

/**
 * Default current_status -> workflow_stages.name mapping, used when the
 * caller doesn't supply an explicit stage_id on a status transition.
 *
 * DECISION (not specified by the client, documented per the build prompt's
 * own instruction to record ambiguous-point decisions in BUILD_LOG rather
 * than silently pick one): 'Intake' has no direct current_status equivalent
 * — it's an internal sub-step within 'Case Entered'/'In Design' per the
 * prompt's own note. We map 'Case Entered' to 'Submitted' (not 'Intake')
 * because 'Submitted' is the case's actual entry point into the 7-step
 * tracker; 'Intake' stays reachable only via an explicit stage_id override
 * on the status endpoint, not as anyone's default.
 */
const STATUS_TO_STAGE_NAME = {
  'Case Entered': 'Submitted',
  'In Design': 'Design',
  'Pending Design Approval': 'Review',
  Processing: 'Production',
  'Pending Bisque Approval': 'Review',
  Finalizing: 'QC',
  'Shipped Out': 'Shipping',
  Delivered: 'Shipping',
};

function isLinear(status) {
  return LINEAR_STATUSES.includes(status);
}

function isException(status) {
  return EXCEPTION_STATUSES.includes(status);
}

function nextLinearStatus(status) {
  const idx = LINEAR_STATUSES.indexOf(status);
  if (idx === -1 || idx === LINEAR_STATUSES.length - 1) return null;
  return LINEAR_STATUSES[idx + 1];
}

/**
 * Session 3 addition: the ONLY legal backward moves in the entire state
 * machine, and only when explicitly unlocked via `allowApprovalRevert`.
 * This is what `POST /api/approvals/:id/request-changes` uses to send a case
 * back to production after the office declines a design/bisque photo — it is
 * NOT a general state-machine capability and is never reachable through
 * `PATCH /api/cases/:id/status` (that endpoint never passes the flag).
 */
const APPROVAL_REVERT_MAP = {
  'Pending Design Approval': 'In Design',
  'Pending Bisque Approval': 'Processing',
};

/**
 * Decides whether a requested transition is legal and what kind it is.
 * Does not touch the DB — the controller is responsible for loading
 * currentStatus/priorStatus first and persisting the result after.
 *
 * @returns {{ valid: true, kind: 'forward'|'enter_exception'|'clear_exception'|'approval_reverted' }
 *          | { valid: false, status: number, message: string }}
 */
function evaluateTransition({ currentStatus, priorStatus, newStatus }, { allowApprovalRevert = false } = {}) {
  if (currentStatus === TERMINAL_STATUS) {
    return {
      valid: false,
      status: 409,
      message: 'This case is Delivered — a delivered case is terminal and cannot be transitioned.',
    };
  }

  if (newStatus === currentStatus) {
    return {
      valid: false,
      status: 409,
      message: `Case is already in status "${currentStatus}".`,
    };
  }

  // Currently suspended (Hold or Delayed) — the ONLY legal move is clearing
  // back to prior_status. No direct Hold<->Delayed switch, no advancing
  // forward while suspended.
  if (isException(currentStatus)) {
    if (newStatus === priorStatus) {
      return { valid: true, kind: 'clear_exception' };
    }
    return {
      valid: false,
      status: 409,
      message: `Case is currently "${currentStatus}". The only valid transition is clearing it back to "${priorStatus}".`,
    };
  }

  // Currently in the normal linear flow.
  if (isException(newStatus)) {
    return { valid: true, kind: 'enter_exception' };
  }

  if (allowApprovalRevert && APPROVAL_REVERT_MAP[currentStatus] === newStatus) {
    return { valid: true, kind: 'approval_reverted' };
  }

  const expectedNext = nextLinearStatus(currentStatus);
  if (newStatus === expectedNext) {
    return { valid: true, kind: 'forward' };
  }

  return {
    valid: false,
    status: 409,
    message: expectedNext
      ? `Invalid transition: "${currentStatus}" can only move forward to "${expectedNext}" (or into Case on Hold / Delayed).`
      : `Invalid transition from "${currentStatus}".`,
  };
}

module.exports = {
  LINEAR_STATUSES,
  EXCEPTION_STATUSES,
  TERMINAL_STATUS,
  ALL_STATUSES,
  STATUS_TO_STAGE_NAME,
  APPROVAL_REVERT_MAP,
  isLinear,
  isException,
  nextLinearStatus,
  evaluateTransition,
};
