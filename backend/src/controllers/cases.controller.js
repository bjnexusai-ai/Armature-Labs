const { z } = require('zod');
const { query, withTransaction } = require('../config/db');
const { assertPracticeAccess, practiceScopeClause } = require('../middleware/tenantIsolation');
const { ALL_STATUSES, STATUS_TO_STAGE_NAME } = require('../utils/caseStatus');
const { applyCaseStatusTransition } = require('../services/caseStatusTransition');
const notifications = require('../services/notifications');

// patient_id added alongside the legacy patient_name/patient_reference_id
// flat fields, not in place of them — 0023_patients.js/0025_backfill_case_
// patient_id.js added the column and backfill, but nothing selected it
// until now. Frontend still renders the flat fields; this only makes the
// link reachable for screens that want it (e.g. linking a case to its
// Patients-tab record). Migrating off patient_name/patient_reference_id
// entirely is a separate, larger decision this fix deliberately doesn't make.
const CASE_SELECT_FIELDS = `
  c.id, c.case_number, c.practice_id, c.dentist_id, c.case_type_id, c.patient_id,
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
    // Optional, additive alongside the legacy flat fields above (see
    // CASE_SELECT_FIELDS comment) — not required, since not every case has
    // a linked patients-table record yet.
    patientId: z.coerce.number().int().positive().optional(),
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

    // patientId, if given, must reference an existing patient at the SAME
    // practice as the case — mirrors assertPracticeAccess's own reasoning,
    // applied here as a direct row check since this isn't a request-user
    // access check but a data-integrity one between two sibling rows.
    if (input.patientId) {
      const patientRow = await client.query('SELECT id, practice_id FROM patients WHERE id = $1', [input.patientId]);
      if (!patientRow.rows[0]) {
        const err = new Error('patientId does not reference an existing patient.');
        err.status = 400;
        throw err;
      }
      if (String(patientRow.rows[0].practice_id) !== String(input.practiceId)) {
        const err = new Error('patientId does not belong to the specified practiceId.');
        err.status = 400;
        throw err;
      }
    }

    // case_number and current_status are NOT set here — DB trigger / column
    // default own them, per the build prompt's explicit instruction.
    const caseRow = await client.query(
      `INSERT INTO cases
         (practice_id, dentist_id, case_type_id, patient_id, patient_name, patient_reference_id,
          rx_instructions, priority, due_date, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING ${CASE_SELECT_FIELDS.replace(/c\./g, '')}`,
      [
        input.practiceId,
        input.dentistId,
        input.caseTypeId,
        input.patientId || null,
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
    // Nullable so an existing link can be cleared, not just set — mirrors
    // assignedStaffId's own nullable().optional() pattern below.
    patientId: z.coerce.number().int().positive().nullable().optional(),
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
  patientId: 'patient_id',
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

  const existing = await query('SELECT id, practice_id FROM cases WHERE id = $1', [caseId]);
  if (!existing.rows[0]) {
    return res.status(404).json({ error: 'Case not found.' });
  }

  if (input.patientId) {
    const patientRow = await query('SELECT id, practice_id FROM patients WHERE id = $1', [input.patientId]);
    if (!patientRow.rows[0]) {
      const err = new Error('patientId does not reference an existing patient.');
      err.status = 400;
      throw err;
    }
    if (String(patientRow.rows[0].practice_id) !== String(existing.rows[0].practice_id)) {
      const err = new Error('patientId does not belong to this case\'s practice.');
      err.status = 400;
      throw err;
    }
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

  // Thin wrapper (§2b extraction) — note allowApprovalRevert is never passed
  // here, so the 'approval_reverted' backward moves stay unreachable via this
  // endpoint even though evaluateTransition knows about them.
  const result = await withTransaction((client) => applyCaseStatusTransition(client, {
    caseId,
    newStatus: input.newStatus,
    changedByUserId: req.user.id,
    remarks: input.remarks,
    stageId: input.stageId,
  }));

  return res.json({ case: result });
}

// ─────────────────────────────────────────────────────────────────────────
// POST /api/cases/:id/media  (§2c — new upload path; none existed to extend)
// ─────────────────────────────────────────────────────────────────────────

// Metadata-only: the file itself is assumed already placed in object storage
// by the caller (e.g. a pre-signed upload from the frontend). No multer/S3
// wiring is built this session — that infrastructure isn't part of Session
// 3's scope per the build prompt, and this endpoint only needs a pointer
// (file_url) plus enough metadata to satisfy the approvals gate. Documented
// as a decision in BUILD_LOG.md.
const uploadCaseMediaSchema = z
  .object({
    fileName: z.string().min(1).max(255),
    fileType: z.enum(['STL', '3Shape', 'Exocad', 'Image', 'Video', 'PDF', 'Other']),
    // Only design/bisque this session — those are the two stages that create
    // an approval gate. Other case_files media_stage values (pickup_form,
    // pre_treatment, final) aren't wired to this endpoint's approval-trigger
    // behavior and are out of scope here.
    mediaStage: z.enum(['design', 'bisque']),
    fileUrl: z.string().min(1).max(500),
  })
  .strict();

const STAGE_TO_PENDING_STATUS = {
  design: 'Pending Design Approval',
  bisque: 'Pending Bisque Approval',
};

async function uploadCaseMedia(req, res) {
  const caseId = req.params.id;
  const input = uploadCaseMediaSchema.parse(req.body);

  const result = await withTransaction(async (client) => {
    const caseRow = await client.query('SELECT id, practice_id FROM cases WHERE id = $1', [caseId]);
    if (!caseRow.rows[0]) {
      const err = new Error('Case not found.');
      err.status = 404;
      throw err;
    }

    // 1. Insert the case_files row.
    const fileRow = await client.query(
      `INSERT INTO case_files (case_id, uploaded_by, file_name, file_type, media_stage, file_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, case_id, uploaded_by, file_name, file_type, media_stage, file_url, version_number, uploaded_at`,
      [caseId, req.user.id, input.fileName, input.fileType, input.mediaStage, input.fileUrl]
    );
    const file = fileRow.rows[0];

    // 2. Insert the pending approvals row.
    const approvalRow = await client.query(
      `INSERT INTO approvals (case_id, media_id, stage, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id, case_id, media_id, stage, status, approved_by, comments, responded_at, created_at`,
      [caseId, file.id, input.mediaStage]
    );
    const approval = approvalRow.rows[0];

    // 3. Move the case into the matching pending-approval status. This is a
    // normal forward transition through the existing state machine — if the
    // case isn't currently sitting at the right predecessor status
    // (In Design / Processing), this correctly 409s rather than silently
    // skipping the state machine's own rules.
    const updatedCase = await applyCaseStatusTransition(client, {
      caseId,
      newStatus: STAGE_TO_PENDING_STATUS[input.mediaStage],
      changedByUserId: req.user.id,
      remarks: `${input.mediaStage} media uploaded — awaiting client approval.`,
    });

    return { file, approval, case: updatedCase, practiceId: caseRow.rows[0].practice_id };
  });

  // 4. Notify: new design/bisque approval request -> dental office (every
  // portal user on that practice with can_approve_photos = true).
  const recipients = await query(
    `SELECT u.id FROM users u
     JOIN practice_users pu ON pu.user_id = u.id
     WHERE pu.practice_id = $1 AND u.can_approve_photos = true`,
    [result.practiceId]
  );
  if (recipients.rows.length) {
    await notifications.notify({
      event: 'approval_requested',
      recipientUserIds: recipients.rows.map((r) => r.id),
      payload: { caseId: result.case.id, approvalId: result.approval.id, stage: input.mediaStage },
    });
  }

  return res.status(201).json({ file: result.file, approval: result.approval, case: result.case });
}

module.exports = {
  createCase,
  listCases,
  getCase,
  updateCase,
  updateCaseStatus,
  uploadCaseMedia,
};
