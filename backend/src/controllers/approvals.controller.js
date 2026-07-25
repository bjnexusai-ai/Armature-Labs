const { z } = require('zod');
const { withTransaction } = require('../config/db');
const { assertPracticeAccess } = require('../middleware/tenantIsolation');
const { applyCaseStatusTransition } = require('../services/caseStatusTransition');
const notifications = require('../services/notifications');

// Approve -> the case's normal forward status past the gate.
const STAGE_TO_FORWARD_STATUS = { design: 'Processing', bisque: 'Finalizing' };
// Request Changes -> revert to prior production status (the 'approval_reverted'
// backward move, only reachable from here — see caseStatus.js).
const STAGE_TO_REVERT_STATUS = { design: 'In Design', bisque: 'Processing' };

/**
 * Loads + row-locks the approvals row, then validates: exists, acting user
 * has can_approve_photos, tenant access, still pending. Shared by both
 * approve and request-changes since the auth/tenant/row-lock pattern is
 * identical (§2c).
 */
async function loadAndAuthorizeApproval(client, req, approvalId) {
  if (!req.user.can_approve_photos) {
    const err = new Error('You do not have permission to act on approvals.');
    err.status = 403;
    throw err;
  }

  const approvalRow = await client.query(
    'SELECT id, case_id, stage, status FROM approvals WHERE id = $1 FOR UPDATE',
    [approvalId]
  );
  const approval = approvalRow.rows[0];
  if (!approval) {
    const err = new Error('Approval not found.');
    err.status = 404;
    throw err;
  }

  const caseRow = await client.query('SELECT practice_id, assigned_staff_id FROM cases WHERE id = $1', [
    approval.case_id,
  ]);
  const caseRecord = caseRow.rows[0];

  // Tenant isolation via the existing pattern — a dentist_client can only act
  // on approvals for their own practice's cases.
  assertPracticeAccess(req.user, caseRecord.practice_id);

  if (approval.status !== 'pending') {
    const err = new Error(`This approval has already been responded to (status: "${approval.status}").`);
    err.status = 409;
    throw err;
  }

  return { approval, caseRecord };
}

// ─────────────────────────────────────────────────────────────────────────
// POST /api/approvals/:id/approve
// ─────────────────────────────────────────────────────────────────────────

const approveSchema = z.object({ comments: z.string().max(2000).optional() }).strict();

async function approveApproval(req, res) {
  const approvalId = req.params.id;
  const input = approveSchema.parse(req.body);

  const result = await withTransaction(async (client) => {
    const { approval, caseRecord } = await loadAndAuthorizeApproval(client, req, approvalId);

    await client.query(
      `UPDATE approvals SET status = 'approved', approved_by = $1, comments = $2, responded_at = now()
       WHERE id = $3`,
      [req.user.id, input.comments || null, approvalId]
    );

    const updatedCase = await applyCaseStatusTransition(client, {
      caseId: approval.case_id,
      newStatus: STAGE_TO_FORWARD_STATUS[approval.stage],
      changedByUserId: req.user.id,
      remarks: `Approval #${approvalId} (${approval.stage}) approved via portal.`,
    });

    return {
      approval: { ...approval, status: 'approved', comments: input.comments || null },
      case: updatedCase,
      assignedStaffId: caseRecord.assigned_staff_id,
    };
  });

  // Fire "approval given -> assigned staff" trigger.
  if (result.assignedStaffId) {
    await notifications.notify({
      event: 'approval_given',
      recipientUserIds: [result.assignedStaffId],
      payload: { approvalId: Number(approvalId), caseId: result.case.id, stage: result.approval.stage },
    });
  }

  return res.json({ approval: result.approval, case: result.case });
}

// ─────────────────────────────────────────────────────────────────────────
// POST /api/approvals/:id/request-changes
// ─────────────────────────────────────────────────────────────────────────

const requestChangesSchema = z
  .object({
    // REQUIRED here (unlike approve) — this is the reason for the rejection
    // and must be visible to staff per the client's own workflow spec.
    comments: z.string().min(1, 'comments is required when requesting changes.').max(2000),
  })
  .strict();

async function requestChangesApproval(req, res) {
  const approvalId = req.params.id;
  const input = requestChangesSchema.parse(req.body);

  const result = await withTransaction(async (client) => {
    const { approval, caseRecord } = await loadAndAuthorizeApproval(client, req, approvalId);

    await client.query(
      `UPDATE approvals SET status = 'rejected', approved_by = $1, comments = $2, responded_at = now()
       WHERE id = $3`,
      [req.user.id, input.comments, approvalId]
    );

    // The one and only caller allowed to pass allowApprovalRevert: true.
    const updatedCase = await applyCaseStatusTransition(client, {
      caseId: approval.case_id,
      newStatus: STAGE_TO_REVERT_STATUS[approval.stage],
      changedByUserId: req.user.id,
      remarks: `Approval #${approvalId} (${approval.stage}) changes requested via portal: ${input.comments}`,
      allowApprovalRevert: true,
    });

    return {
      approval: { ...approval, status: 'rejected', comments: input.comments },
      case: updatedCase,
      assignedStaffId: caseRecord.assigned_staff_id,
    };
  });

  // Fire "changes requested -> assigned staff" trigger.
  if (result.assignedStaffId) {
    await notifications.notify({
      event: 'changes_requested',
      recipientUserIds: [result.assignedStaffId],
      payload: {
        approvalId: Number(approvalId),
        caseId: result.case.id,
        stage: result.approval.stage,
        comments: result.approval.comments,
      },
    });
  }

  return res.json({ approval: result.approval, case: result.case });
}

module.exports = { approveApproval, requestChangesApproval };
