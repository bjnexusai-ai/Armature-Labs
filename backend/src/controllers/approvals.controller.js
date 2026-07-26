const { z } = require('zod');
const { withTransaction, query } = require('../config/db');
const { assertPracticeAccess, practiceScopeClause } = require('../middleware/tenantIsolation');
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

// ─────────────────────────────────────────────────────────────────────────
// GET /api/approvals
//
// The 0014 migration's own comment says this table is "queried both ways:
// pending approvals for a case, and all pending approvals across the
// practice, for a portal dashboard" — but no route was ever built for it.
// This closes that gap. Not gated on can_approve_photos: that flag governs
// the two write actions (approve/request-changes) per the client's §8 spec,
// but everyone who can already see a case's status (internal staff lab-wide,
// dentist_client scoped to their own practice via practiceScopeClause) can
// see that an approval is pending on it — same visibility as GET /api/cases.
// ─────────────────────────────────────────────────────────────────────────

const listApprovalsQuerySchema = z.object({
  caseId: z.coerce.number().int().positive().optional(),
  practiceId: z.coerce.number().int().positive().optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  stage: z.enum(['design', 'bisque']).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(25),
});

async function listApprovals(req, res) {
  const input = listApprovalsQuerySchema.parse(req.query);

  if (req.user.role === 'dentist_client' && input.practiceId) {
    const err = new Error(
      'practiceId filtering is not available on the portal — results are already scoped to your own practice.'
    );
    err.status = 400;
    throw err;
  }

  const conditions = ['1=1'];
  const params = [];

  const scope = practiceScopeClause(req.user, params.length + 1, 'c.practice_id');
  if (scope.clause) {
    conditions.push(scope.clause.replace(/^ AND /, ''));
    params.push(...scope.params);
  }

  if (input.caseId) {
    params.push(input.caseId);
    conditions.push(`a.case_id = $${params.length}`);
  }
  if (input.practiceId) {
    params.push(input.practiceId);
    conditions.push(`c.practice_id = $${params.length}`);
  }
  if (input.status) {
    params.push(input.status);
    conditions.push(`a.status = $${params.length}`);
  }
  if (input.stage) {
    params.push(input.stage);
    conditions.push(`a.stage = $${params.length}`);
  }

  const offset = (input.page - 1) * input.limit;

  const countResult = await query(
    `SELECT COUNT(*)::int AS total
     FROM approvals a
     JOIN cases c ON c.id = a.case_id
     WHERE ${conditions.join(' AND ')}`,
    params
  );

  params.push(input.limit);
  params.push(offset);
  const { rows } = await query(
    `SELECT
       a.id, a.case_id, a.media_id, a.stage, a.status, a.approved_by,
       a.comments, a.responded_at, a.created_at,
       c.case_number, c.practice_id, c.patient_name, c.current_status AS case_current_status,
       cf.file_name AS media_file_name, cf.file_url AS media_file_url
     FROM approvals a
     JOIN cases c ON c.id = a.case_id
     JOIN case_files cf ON cf.id = a.media_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY a.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return res.json({
    approvals: rows,
    pagination: {
      page: input.page,
      limit: input.limit,
      total: countResult.rows[0].total,
      totalPages: Math.ceil(countResult.rows[0].total / input.limit),
    },
  });
}

module.exports = { approveApproval, requestChangesApproval, listApprovals };

