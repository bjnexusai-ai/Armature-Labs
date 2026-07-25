const { STATUS_TO_STAGE_NAME, evaluateTransition } = require('../utils/caseStatus');

const CASE_SELECT_FIELDS = `
  id, case_number, practice_id, dentist_id, case_type_id,
  patient_name, patient_reference_id, rx_instructions, priority,
  due_date, current_status, prior_status, assigned_staff_id, notes,
  created_at, updated_at
`;

/**
 * Session 3 extraction (§2b): this is Session 2's updateCaseStatus transaction
 * callback, moved verbatim — same evaluateTransition call, same
 * case_status_audit insert, same case_stage_history branch logic. No behavior
 * change. `cases.controller.js`'s updateCaseStatus is now a thin wrapper
 * around this. The approvals endpoints (approve / request-changes) call this
 * same function from inside their own transaction, alongside their own
 * writes to the `approvals` table.
 *
 * `allowApprovalRevert`: see the doc-comment on APPROVAL_REVERT_MAP in
 * caseStatus.js. Only the request-changes code path passes true.
 */
async function applyCaseStatusTransition(client, {
  caseId, newStatus, changedByUserId, remarks, stageId, allowApprovalRevert = false,
}) {
  const caseRow = await client.query(
    'SELECT id, current_status, prior_status FROM cases WHERE id = $1 FOR UPDATE',
    [caseId]
  );
  const caseRecord = caseRow.rows[0];
  if (!caseRecord) {
    const err = new Error('Case not found.');
    err.status = 404;
    throw err;
  }

  const evaluation = evaluateTransition(
    { currentStatus: caseRecord.current_status, priorStatus: caseRecord.prior_status, newStatus },
    { allowApprovalRevert }
  );

  if (!evaluation.valid) {
    const err = new Error(evaluation.message);
    err.status = evaluation.status;
    throw err;
  }

  // Endpoint spec requires remarks whenever ENTERING or CLEARING Hold/Delayed
  // (the stricter of the two build-prompt readings — the Endpoints section
  // explicitly says "required if entering/clearing", so we hold both to it).
  const touchesException = evaluation.kind === 'enter_exception' || evaluation.kind === 'clear_exception';
  if (touchesException && !remarks) {
    const err = new Error('remarks is required when entering or clearing Case on Hold / Delayed.');
    err.status = 400;
    throw err;
  }

  // 1. Update cases.current_status (and prior_status).
  let newPriorStatus = caseRecord.prior_status;
  if (evaluation.kind === 'enter_exception') {
    newPriorStatus = caseRecord.current_status;
  } else if (evaluation.kind === 'clear_exception') {
    newPriorStatus = null;
  }

  const updatedCase = await client.query(
    `UPDATE cases SET current_status = $1, prior_status = $2 WHERE id = $3
     RETURNING ${CASE_SELECT_FIELDS}`,
    [newStatus, newPriorStatus, caseId]
  );

  // 2. case_status_audit — every transition, no exceptions.
  await client.query(
    `INSERT INTO case_status_audit (case_id, changed_by, old_status, new_status, remarks)
     VALUES ($1, $2, $3, $4, $5)`,
    [caseId, changedByUserId, caseRecord.current_status, newStatus, remarks || null]
  );

  // 3. case_stage_history — see the identical decision block in BUILD_LOG.md
  // Session 2 (Hold = no-op, Delayed = in-place row update, everything else
  // completes the open row and opens the target stage's row, collapsing into
  // one row if old/new stage are the same). approval_reverted lands in the
  // final `else` branch same as any other forward-mapped linear status — its
  // target status (In Design / Processing) has a normal STATUS_TO_STAGE_NAME
  // entry, so no special-casing is needed here.
  const openRow = await client.query(
    `SELECT id, stage_id FROM case_stage_history
     WHERE case_id = $1 AND status IN ('In Progress', 'Delayed')
     ORDER BY started_at DESC LIMIT 1`,
    [caseId]
  );
  const open = openRow.rows[0] || null;

  if (newStatus === 'Case on Hold' || (evaluation.kind === 'clear_exception' && caseRecord.current_status === 'Case on Hold')) {
    // no-op on case_stage_history, per decision above
  } else if (newStatus === 'Delayed') {
    if (open) {
      await client.query(`UPDATE case_stage_history SET status = 'Delayed' WHERE id = $1`, [open.id]);
    }
  } else if (evaluation.kind === 'clear_exception' && caseRecord.current_status === 'Delayed') {
    if (open) {
      await client.query(`UPDATE case_stage_history SET status = 'In Progress' WHERE id = $1`, [open.id]);
    }
  } else {
    const targetStageId = stageId
      || (await client.query('SELECT id FROM workflow_stages WHERE name = $1', [
        STATUS_TO_STAGE_NAME[newStatus],
      ])).rows[0]?.id;

    if (open && open.stage_id === targetStageId) {
      await client.query(
        `UPDATE case_stage_history SET status = 'Completed', completed_at = now() WHERE id = $1`,
        [open.id]
      );
    } else {
      if (open) {
        await client.query(
          `UPDATE case_stage_history SET status = 'Completed', completed_at = now() WHERE id = $1`,
          [open.id]
        );
      }
      if (targetStageId) {
        await client.query(
          `INSERT INTO case_stage_history (case_id, stage_id, status) VALUES ($1, $2, 'In Progress')`,
          [caseId, targetStageId]
        );
      }
    }
  }

  return updatedCase.rows[0];
}

module.exports = { applyCaseStatusTransition };
