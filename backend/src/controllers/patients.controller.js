const { z } = require('zod');
const { query } = require('../config/db');
const { assertPracticeAccess, practiceScopeClause } = require('../middleware/tenantIsolation');

const PATIENT_SELECT_FIELDS = `id, practice_id, first_name, last_name, created_at`;

// ─────────────────────────────────────────────────────────────────────────
// POST /api/patients
// ─────────────────────────────────────────────────────────────────────────

const createPatientSchema = z
  .object({
    practiceId: z.coerce.number().int().positive(),
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
  })
  .strict();

async function createPatient(req, res) {
  const input = createPatientSchema.parse(req.body);

  // Dentist_client may only create a patient at their own practice, and only
  // if the route has already gated on can_edit_patient_info. Internal staff
  // bypass this entirely — lab-wide by design, matching the pattern used
  // throughout cases.controller.js / tenantIsolation.js.
  assertPracticeAccess(req.user, input.practiceId);

  const practiceRow = await query('SELECT id FROM practices WHERE id = $1', [input.practiceId]);
  if (!practiceRow.rows[0]) {
    const err = new Error('practiceId does not reference an existing practice.');
    err.status = 400;
    throw err;
  }

  const { rows } = await query(
    `INSERT INTO patients (practice_id, first_name, last_name)
     VALUES ($1, $2, $3)
     RETURNING ${PATIENT_SELECT_FIELDS}`,
    [input.practiceId, input.firstName, input.lastName]
  );

  return res.status(201).json({ patient: rows[0] });
}

// ─────────────────────────────────────────────────────────────────────────
// GET /api/patients
// ─────────────────────────────────────────────────────────────────────────

const listPatientsQuerySchema = z
  .object({
    practiceId: z.coerce.number().int().positive().optional(),
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().max(100).optional().default(25),
  })
  .strict();

async function listPatients(req, res) {
  const input = listPatientsQuerySchema.parse(req.query);

  if (req.user.role === 'dentist_client' && input.practiceId) {
    const err = new Error('practiceId filtering is not available on the portal — results are already scoped to your own practice.');
    err.status = 400;
    throw err;
  }

  const conditions = ['1=1'];
  const params = [];

  const scope = practiceScopeClause(req.user, params.length + 1, 'practice_id');
  if (scope.clause) {
    conditions.push(scope.clause.replace(/^ AND /, ''));
    params.push(...scope.params);
  }

  if (input.practiceId) {
    params.push(input.practiceId);
    conditions.push(`practice_id = $${params.length}`);
  }

  const offset = (input.page - 1) * input.limit;

  const countResult = await query(
    `SELECT COUNT(*)::int AS total FROM patients WHERE ${conditions.join(' AND ')}`,
    params
  );

  params.push(input.limit);
  params.push(offset);
  const { rows } = await query(
    `SELECT ${PATIENT_SELECT_FIELDS}
     FROM patients
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return res.json({
    patients: rows,
    pagination: {
      page: input.page,
      limit: input.limit,
      total: countResult.rows[0].total,
      totalPages: Math.ceil(countResult.rows[0].total / input.limit),
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────
// GET /api/patients/:id
// ─────────────────────────────────────────────────────────────────────────

async function getPatient(req, res) {
  const patientId = req.params.id;

  const { rows } = await query(`SELECT ${PATIENT_SELECT_FIELDS} FROM patients WHERE id = $1`, [patientId]);
  const patient = rows[0];
  if (!patient) {
    return res.status(404).json({ error: 'Patient not found.' });
  }

  // Existence check before the tenant check — same ordering as
  // cases.controller.js getCase — so a cross-tenant hit is a clean 403,
  // not a 404-vs-200 leak.
  assertPracticeAccess(req.user, patient.practice_id);

  return res.json({ patient });
}

// ─────────────────────────────────────────────────────────────────────────
// PATCH /api/patients/:id
// ─────────────────────────────────────────────────────────────────────────

const updatePatientSchema = z
  .object({
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
  })
  .strict();

const COLUMN_BY_FIELD = {
  firstName: 'first_name',
  lastName: 'last_name',
};

async function updatePatient(req, res) {
  const patientId = req.params.id;
  const input = updatePatientSchema.parse(req.body);

  const fields = Object.keys(input);
  if (fields.length === 0) {
    const err = new Error('No updatable fields provided.');
    err.status = 400;
    throw err;
  }

  const existing = await query('SELECT id, practice_id FROM patients WHERE id = $1', [patientId]);
  if (!existing.rows[0]) {
    return res.status(404).json({ error: 'Patient not found.' });
  }

  // Dentist_client edits are gated by can_edit_patient_info at the route
  // level, plus must own this patient's practice.
  assertPracticeAccess(req.user, existing.rows[0].practice_id);

  const setClauses = [];
  const params = [];
  fields.forEach((field) => {
    params.push(input[field]);
    setClauses.push(`${COLUMN_BY_FIELD[field]} = $${params.length}`);
  });
  params.push(patientId);

  const { rows } = await query(
    `UPDATE patients SET ${setClauses.join(', ')} WHERE id = $${params.length}
     RETURNING ${PATIENT_SELECT_FIELDS}`,
    params
  );

  return res.json({ patient: rows[0] });
}

module.exports = { createPatient, listPatients, getPatient, updatePatient };
