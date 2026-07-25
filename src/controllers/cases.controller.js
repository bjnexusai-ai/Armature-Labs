const { z } = require('zod');
const { query, withTransaction } = require('../config/db');
const { assertPracticeAccess, practiceScopeClause } = require('../middleware/tenantIsolation');
const {
  ALL_STATUSES,
  EXCEPTION_STATUSES,
  STATUS_TO_STAGE_NAME,
  isException,
  evaluateTransition,
} = require('../utils/caseStatus');

const CASE_SELECT_FIELDS = `
  c.id, c.case_number, c.practice_id, c.dentist_id, c.case_type_id,
  c.patient_name, c.patient_reference_id, c.rx_instructions, c.priority,
  c.due_date, c.current_status, c.prior_status, c.assigned_staff_id, c.notes,
  c.created_at, c.updated_at
`;

// ─────────────────────────────────────────────────────────────────────────
// POST /api/cases
// ─────────────────────────────────────────────────────────────────────────

const createCaseSchema = z
  .object({
    practiceId: z.coerce.number().int().positive(),
    dentistId: z.coerce.number().int().positive(),
    caseTypeId: z.coerce.number().int().positive(),
    patientName: z.string().max(150).optional(),
    patientReferenceId: z.string().max(50).optional(),
    rxInstructions: z.string().optional(),
    priority: z.enum(['Standard', 'Rush', 'Urgent']).optional().default('Standard'),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dueDate must be an ISO date (YYYY-MM-DD).'),
    notes: z.string().optional(),
  })
  // .strict() means any unrecognized key (including caseNumber / currentStatus,
  // however cased) throws a ZodError -> clean 400, satisfying "case_number
  // auto-generates ... reject with 400 if present" without a separate check.
  .strict();

async function createCase(req, res) {
  const input = createCaseSchema.parse(req.body);

  const result = await withTransaction(async (client) => {
    const practiceRow = await client.query('SELECT id FROM practices WHERE id = $1', [input.practiceId]);
    if (!practiceRow.rows[0]) {
      const err = new Error('practiceId does not reference an existing practice.');
      err.status = 400;
      throw err;
    }

    const dentistRow = await client.query(
      `SELECT u.id FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1 AND r.name = 'dentist_client'`,
      [input.dentistId]
    );
    if (!dentistRow.rows[0]) {
      const err = new Error('dentistId does not reference an existing dentist_client user.');
      err.status = 400;
      throw err;
    }

    // A dentist can't be assigned to a case at a practice they're not linked to.
    const linkRow = await client.query(
      'SELECT id FROM practice_users WHERE practice_id = $1 AND user_id = $2',
      [input.practiceId, input.dentistId]
    );
    if (!linkRow.rows[0]) {
      const err = new Error('This dentist is not linked to the specified practice.');
      err.status = 400;
      throw err;
    }

    const caseTypeRow = await client.query('SELECT id FROM case_types WHERE id = $1', [input.caseTypeId]);
    if (!caseTypeRow.rows[0]) {
      const err = new Error('caseTypeId does not reference an existing case type.');
      err.status = 400;
      throw err;
    }

    // case_number and current_status are NOT set here — DB trigger / column
    // default own them, per the build prompt's explicit instruction.
    const caseRow = await client.query(
      `INSERT INTO cases
         (practice_id, dentist_id, case_type_id, patient_name, patient_reference_id,
          rx_instructions, priority, due_date, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING ${CASE_SELECT_FIELDS.replace(/c\./g, '')}`,
      [
        input.practiceId,
        input.dentistId,
        input.caseTypeId,
        input.patientName || null,
        input.patientReferenceId || null,
        input.rxInstructions || null,
        input.priority,
        input.dueDate,
        input.notes || null,
      ]
    );
    const newCase = caseRow.rows[0];

    // DECISION (documented in BUILD_LOG): seed the initial case_stage_history
    // row at creation time (stage 'Submitted', status 'In Progress') so every
    // case has a stage-history entry from birth — GET /:id promises to return
    // "the current case_stage_history entry" and there'd be nothing to return
    // otherwise. Every later status transition completes this row and moves on.
    const stageRow = await client.query(
      'SELECT id FROM workflow_stages WHERE name = $1',
      [STATUS_TO_STAGE_NAME['Case Entered']]
    );
    await client.query(
      `INSERT INTO case_stage_history (case_id, stage_id, status)
       VALUES ($1, $2, 'In Progress')`,
      [newCase.id, stageRow.rows[0].id]
    );

    // Mirrors the Session 1 seed script's own pattern: log the initial audit
    // row too, so a case's audit trail always starts at its true beginning.
    await client.query(
      `INSERT INTO case_status_audit (case_id, changed_by, old_status, new_status, remarks)
       VALUES ($1, $2, NULL, 'Case Entered', 'Case created.')`,
      [newCase.id, req.user.id]
    );

    return newCase;
  });

  return res.status(201).json({ case: result });
}

// ─────────────────────────────────────────────────────────────────────────
// GET /api/cases
// ─────────────────────────────────────────────────────────────────────────

const listCasesQuerySchema = z.object({
  status: z.enum(ALL_STATUSES).optional(),
  practiceId: z.coerce.number().int().positive().optional(),
  assignedStaffId: z.coerce.number().int().positive().optional(),
  priority: z.enum(['Standard', 'Rush', 'Urgent']).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(25),
});

async function listCases(req, res) {
  const input = listCasesQuerySchema.parse(req.query);

  if (req.user.role === 'dentist_client' && input.practiceId) {
    const err = new Error('practiceId filtering is not available on the portal — results are already scoped to your own practice.');
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

  if (input.status) {
    params.push(input.status);
    conditions.push(`c.current_status = $${params.length}`);
  }
  if (input.practiceId) {
    params.push(input.practiceId);
    conditions.push(`c.practice_id = $${params.length}`);
  }
  if (input.assignedStaffId) {
    params.push(input.assignedStaffId);
    conditions.push(`c.assigned_staff_id = $${params.length}`);
  }
  if (input.priority) {
    params.push(input.priority);
    conditions.push(`c.priority = $${params.length}`);
  }

  const offset = (input.page - 1) * input.limit;

  const countResult = await query(
    `SELECT COUNT(*)::int AS total FROM cases c WHERE ${conditions.join(' AND ')}`,
    params
  );

  params.push(input.limit);
  params.push(offset);
  const { rows } = await query(
    `SELECT ${CASE_SELECT_FIELDS}
     FROM cases c
     WHERE ${conditions.join(' AND ')}
     ORDER BY c.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return res.json({
    cases: rows,
    pagination: {
      page: input.page,
      limit: input.limit,
      total: countResult.rows[0].total,
      totalPages: Math.ceil(countResult.rows[0].total / input.limit),
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────
// GET /api/cases/:id
// ─────────────────────────────────────────────────────────────────────────

async function getCase(req, res) {
  const caseId = req.params.id;

  const { rows } = await query(`SELECT ${CASE_SELECT_FIELDS} FROM cases c WHERE c.id = $1`, [caseId]);
  const caseRecord = rows[0];
  if (!caseRecord) {
    return res.status(404).json({ error: 'Case not found.' });
  }

  // Tenant isolation enforced AFTER existence check so a cross-tenant hit is a
  // 403, not a 404-vs-200 leak — matches the pattern in practices.controller.js,
  // per the build prompt's explicit instruction.
  assertPracticeAccess(req.user, caseRecord.practice_id);

  const stageResult = await query(
    `SELECT csh.id, csh.stage_id, ws.name AS stage_name, csh.assigned_technician_id,
            csh.started_at, csh.completed_at, csh.status, csh.notes
     FROM case_stage_history csh
     JOIN workflow_stages ws ON ws.id = csh.stage_id
     WHERE csh.case_id = $1
     ORDER BY csh.started_at DESC
     LIMIT 1`,
    [caseId]
  );

  const auditResult = await query(
    `SELECT casa.id, casa.changed_by, u.full_name AS changed_by_name, casa.old_status,
            casa.new_status, casa.remarks, casa.changed_at
     FROM case_status_audit casa
     JOIN users u ON u.id = casa.changed_by
     WHERE casa.case_id = $1
     ORDER BY casa.changed_at DESC
     LIMIT 10`,
    [caseId]
  );

  return res.json({
    case: caseRecord,
    currentStage: stageResult.rows[0] || null,
    recentStatusAudit: auditResult.rows,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// PATCH /api/cases/:id  (non-status fields only)
// ─────────────────────────────────────────────────────────────────────────

const updateCaseSchema = z
  .object({
    patientName: z.string().max(150).optional(),
    patientReferenceId: z.string().max(50).optional(),
    rxInstructions: z.string().optional(),
    priority: z.enum(['Standard', 'Rush', 'Urgent']).optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dueDate must be an ISO date (YYYY-MM-DD).').optional(),
    assignedStaffId: z.coerce.number().int().positive().nullable().optional(),
    notes: z.string().optional(),
  })
  // .strict() rejects currentStatus/current_status (or any other unknown key)
  // with a 400 automatically — status changes ONLY go through PATCH .../status.
  .strict();

const COLUMN_BY_FIELD = {
  patientName: 'patient_name',
  patientReferenceId: 'patient_reference_id',
  rxInstructions: 'rx_instructions',
  priority: 'priority',
  dueDate: 'due_date',
  assignedStaffId: 'assigned_staff_id',
  notes: 'notes',
};

async function updateCase(req, res) {
  const caseId = req.params.id;
  const input = updateCaseSchema.parse(req.body);

  const fields = Object.keys(input);
  if (fields.length === 0) {
    const err = new Error('No updatable fields provided.');
    err.status = 400;
    throw err;
  }

  const existing = await query('SELECT id FROM cases WHERE id = $1', [caseId]);
  if (!existing.rows[0]) {
    return res.status(404).json({ error: 'Case not found.' });
  }

  const setClauses = [];
  const params = [];
  fields.forEach((field) => {
    params.push(input[field]);
    setClauses.push(`${COLUMN_BY_FIELD[field]} = $${params.length}`);
  });
  params.push(caseId);

  const { rows } = await query(
    `UPDATE cases SET ${setClauses.join(', ')} WHERE id = $${params.length}
     RETURNING ${CASE_SELECT_FIELDS.replace(/c\./g, '')}`,
    params
  );

  return res.json({ case: rows[0] });
}

// ─────────────────────────────────────────────────────────────────────────
// PATCH /api/cases/:id/status
// ─────────────────────────────────────────────────────────────────────────

const updateStatusSchema = z
  .object({
    newStatus: z.enum(ALL_STATUSES),
    remarks: z.string().min(1).optional(),
    stageId: z.coerce.number().int().positive().optional(),
  })
  .strict();

async function updateCaseStatus(req, res) {
  const caseId = req.params.id;
  const input = updateStatusSchema.parse(req.body);

  const result = await withTransaction(async (client) => {
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

    const evaluation = evaluateTransition({
      currentStatus: caseRecord.current_status,
      priorStatus: caseRecord.prior_status,
      newStatus: input.newStatus,
    });

    if (!evaluation.valid) {
      const err = new Error(evaluation.message);
      err.status = evaluation.status;
      throw err;
    }

    // Endpoint spec requires remarks whenever ENTERING or CLEARING Hold/Delayed
    // (the stricter of the two build-prompt readings — the Endpoints section
    // explicitly says "required if entering/clearing", so we hold both to it).
    const touchesException = evaluation.kind === 'enter_exception' || evaluation.kind === 'clear_exception';
    if (touchesException && !input.remarks) {
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
       RETURNING ${CASE_SELECT_FIELDS.replace(/c\./g, '')}`,
      [input.newStatus, newPriorStatus, caseId]
    );

    // 2. case_status_audit — every transition, no exceptions.
    await client.query(
      `INSERT INTO case_status_audit (case_id, changed_by, old_status, new_status, remarks)
       VALUES ($1, $2, $3, $4, $5)`,
      [caseId, req.user.id, caseRecord.current_status, input.newStatus, input.remarks || null]
    );

    // 3. case_stage_history.
    //
    // DECISION (no client spec for exception-state stage mapping, documented
    // per the build prompt's own instruction):
    // - Entering 'Case on Hold': stage_history_status has no 'Hold' value and
    //   Hold is administrative, not stage-level — leave case_stage_history
    //   untouched.
    // - Entering 'Delayed': stage_history_status DOES have a 'Delayed' value
    //   — mark the case's current open stage row 'Delayed' in place (no new
    //   row, no completed_at; the stage itself hasn't changed, it's paused).
    // - Clearing Hold: nothing to revert (nothing was touched on entry).
    // - Clearing Delayed: revert that same row from 'Delayed' back to
    //   'In Progress'.
    // - Normal forward transitions (including into Delivered): complete the
    //   previous open row and insert a row for the new stage — UNLESS the new
    //   stage is the same stage as the one just completed (Shipped Out ->
    //   Delivered both map to 'Shipping'), in which case we complete that one
    //   row rather than inserting a duplicate.
    const openRow = await client.query(
      `SELECT id, stage_id FROM case_stage_history
       WHERE case_id = $1 AND status IN ('In Progress', 'Delayed')
       ORDER BY started_at DESC LIMIT 1`,
      [caseId]
    );
    const open = openRow.rows[0] || null;

    if (input.newStatus === 'Case on Hold' || (evaluation.kind === 'clear_exception' && caseRecord.current_status === 'Case on Hold')) {
      // no-op on case_stage_history, per decision above
    } else if (input.newStatus === 'Delayed') {
      if (open) {
        await client.query(`UPDATE case_stage_history SET status = 'Delayed' WHERE id = $1`, [open.id]);
      }
    } else if (evaluation.kind === 'clear_exception' && caseRecord.current_status === 'Delayed') {
      if (open) {
        await client.query(`UPDATE case_stage_history SET status = 'In Progress' WHERE id = $1`, [open.id]);
      }
    } else {
      // Only genuine forward transitions reach this branch (Hold/Delayed
      // entry and clearing are both handled above), so input.newStatus is
      // always a LINEAR_STATUSES value with a defined default stage mapping.
      const targetStageId = input.stageId
        || (await client.query('SELECT id FROM workflow_stages WHERE name = $1', [
          STATUS_TO_STAGE_NAME[input.newStatus],
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
  });

  return res.json({ case: result });
}

module.exports = {
  createCase,
  listCases,
  getCase,
  updateCase,
  updateCaseStatus,
};
