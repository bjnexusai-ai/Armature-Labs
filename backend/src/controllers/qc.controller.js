const { z } = require('zod');
const { query, withTransaction } = require('../config/db');

// ─────────────────────────────────────────────────────────────────────────
// QC checklist templates
// ─────────────────────────────────────────────────────────────────────────

const createChecklistSchema = z
  .object({
    name: z.string().min(1).max(150),
    caseTypeId: z.coerce.number().int().positive().optional(),
    items: z.array(z.string().min(1).max(255)).min(1, 'At least one checklist item is required.'),
  })
  .strict();

async function createChecklist(req, res) {
  const input = createChecklistSchema.parse(req.body);

  const result = await withTransaction(async (client) => {
    if (input.caseTypeId) {
      const caseTypeRow = await client.query('SELECT id FROM case_types WHERE id = $1', [input.caseTypeId]);
      if (!caseTypeRow.rows[0]) {
        const err = new Error('caseTypeId does not reference an existing case type.');
        err.status = 400;
        throw err;
      }
    }

    const checklistRow = await client.query(
      `INSERT INTO qc_checklists (name, case_type_id) VALUES ($1, $2)
       RETURNING id, name, case_type_id, is_active, created_at`,
      [input.name, input.caseTypeId || null]
    );
    const checklist = checklistRow.rows[0];

    const items = [];
    for (let i = 0; i < input.items.length; i += 1) {
      const itemRow = await client.query(
        `INSERT INTO qc_checklist_items (qc_checklist_id, item_text, sort_order)
         VALUES ($1, $2, $3)
         RETURNING id, item_text, sort_order`,
        [checklist.id, input.items[i], i]
      );
      items.push(itemRow.rows[0]);
    }

    return { ...checklist, items };
  });

  return res.status(201).json({ checklist: result });
}

async function listChecklists(req, res) {
  const { rows: checklists } = await query(
    `SELECT id, name, case_type_id, is_active, created_at FROM qc_checklists
     WHERE is_active = true ORDER BY name`
  );
  const { rows: items } = await query(
    `SELECT qc_checklist_id, id, item_text, sort_order FROM qc_checklist_items ORDER BY sort_order`
  );
  const byChecklist = new Map();
  for (const item of items) {
    if (!byChecklist.has(item.qc_checklist_id)) byChecklist.set(item.qc_checklist_id, []);
    byChecklist.get(item.qc_checklist_id).push(item);
  }
  const result = checklists.map((c) => ({ ...c, items: byChecklist.get(c.id) || [] }));
  return res.json({ checklists: result });
}

// ─────────────────────────────────────────────────────────────────────────
// Case QC results — POST /api/cases/:id/qc-results
// ─────────────────────────────────────────────────────────────────────────

const recordQcResultSchema = z
  .object({
    qcChecklistId: z.coerce.number().int().positive(),
    itemResults: z
      .array(
        z.object({
          itemId: z.coerce.number().int().positive(),
          passed: z.boolean(),
          note: z.string().max(500).optional(),
        })
      )
      .min(1),
    notes: z.string().optional(),
  })
  .strict();

async function recordQcResult(req, res) {
  const caseId = req.params.id;
  const input = recordQcResultSchema.parse(req.body);

  const result = await withTransaction(async (client) => {
    const caseRow = await client.query('SELECT id FROM cases WHERE id = $1', [caseId]);
    if (!caseRow.rows[0]) {
      const err = new Error('Case not found.');
      err.status = 404;
      throw err;
    }
    const checklistRow = await client.query('SELECT id FROM qc_checklists WHERE id = $1', [input.qcChecklistId]);
    if (!checklistRow.rows[0]) {
      const err = new Error('qcChecklistId does not reference an existing checklist.');
      err.status = 400;
      throw err;
    }

    const overallStatus = input.itemResults.every((r) => r.passed) ? 'Pass' : 'Fail';

    const resultRow = await client.query(
      `INSERT INTO case_qc_results (case_id, qc_checklist_id, item_results, overall_status, performed_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, case_id, qc_checklist_id, item_results, overall_status, performed_by, notes, created_at`,
      [caseId, input.qcChecklistId, JSON.stringify(input.itemResults), overallStatus, req.user.id, input.notes || null]
    );

    return resultRow.rows[0];
  });

  return res.status(201).json({ qcResult: result });
}

async function listQcResults(req, res) {
  const caseId = req.params.id;
  const { rows } = await query(
    `SELECT id, case_id, qc_checklist_id, item_results, overall_status, performed_by, notes, created_at
     FROM case_qc_results WHERE case_id = $1 ORDER BY created_at DESC`,
    [caseId]
  );
  return res.json({ qcResults: rows });
}

// ─────────────────────────────────────────────────────────────────────────
// Rework — POST /api/cases/:id/rework, PATCH /api/rework/:id/resolve
//
// DECISION: does NOT call the existing case status-transition service. See
// migrations/0018_case_rework_and_final_approvals.js for why — the state
// machine only allows forward moves plus two named exceptions, and a
// generic backward "send to rework" isn't a legal transition there. Rework
// is tracked as its own independent record instead.
// ─────────────────────────────────────────────────────────────────────────

const createReworkSchema = z
  .object({
    reason: z.string().min(1),
    caseQcResultId: z.coerce.number().int().positive().optional(),
  })
  .strict();

async function createCaseRework(req, res) {
  const caseId = req.params.id;
  const input = createReworkSchema.parse(req.body);

  const caseRow = await query('SELECT id FROM cases WHERE id = $1', [caseId]);
  if (!caseRow.rows[0]) {
    return res.status(404).json({ error: 'Case not found.' });
  }

  if (input.caseQcResultId) {
    const qcRow = await query('SELECT id, case_id FROM case_qc_results WHERE id = $1', [input.caseQcResultId]);
    if (!qcRow.rows[0]) {
      return res.status(400).json({ error: 'caseQcResultId does not reference an existing QC result.' });
    }
    if (String(qcRow.rows[0].case_id) !== String(caseId)) {
      return res.status(400).json({ error: 'That QC result does not belong to this case.' });
    }
  }

  const { rows } = await query(
    `INSERT INTO case_rework (case_id, case_qc_result_id, reason, requested_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id, case_id, case_qc_result_id, reason, requested_by, resolved_at, created_at`,
    [caseId, input.caseQcResultId || null, input.reason, req.user.id]
  );

  return res.status(201).json({ rework: rows[0] });
}

async function listCaseRework(req, res) {
  const caseId = req.params.id;
  const { rows } = await query(
    `SELECT id, case_id, case_qc_result_id, reason, requested_by, resolved_at, resolved_by, resolution_notes, created_at
     FROM case_rework WHERE case_id = $1 ORDER BY created_at DESC`,
    [caseId]
  );
  return res.json({ rework: rows });
}

const resolveReworkSchema = z.object({ resolutionNotes: z.string().optional() }).strict();

async function resolveCaseRework(req, res) {
  const reworkId = req.params.id;
  const input = resolveReworkSchema.parse(req.body);

  const result = await withTransaction(async (client) => {
    const reworkRow = await client.query('SELECT id, resolved_at FROM case_rework WHERE id = $1 FOR UPDATE', [
      reworkId,
    ]);
    const rework = reworkRow.rows[0];
    if (!rework) {
      const err = new Error('Rework record not found.');
      err.status = 404;
      throw err;
    }
    if (rework.resolved_at) {
      const err = new Error('This rework has already been resolved.');
      err.status = 409;
      throw err;
    }

    const updated = await client.query(
      `UPDATE case_rework SET resolved_at = now(), resolved_by = $1, resolution_notes = $2
       WHERE id = $3
       RETURNING id, case_id, case_qc_result_id, reason, requested_by, resolved_at, resolved_by, resolution_notes, created_at`,
      [req.user.id, input.resolutionNotes || null, reworkId]
    );
    return updated.rows[0];
  });

  return res.json({ rework: result });
}

// ─────────────────────────────────────────────────────────────────────────
// Final approval — POST /api/cases/:id/final-approval
// Must reference a Pass QC result; one final approval per case (unique
// constraint at the DB level backs this up).
// ─────────────────────────────────────────────────────────────────────────

const finalApprovalSchema = z
  .object({
    caseQcResultId: z.coerce.number().int().positive(),
    notes: z.string().optional(),
  })
  .strict();

async function createFinalApproval(req, res) {
  const caseId = req.params.id;
  const input = finalApprovalSchema.parse(req.body);

  const result = await withTransaction(async (client) => {
    const caseRow = await client.query('SELECT id FROM cases WHERE id = $1', [caseId]);
    if (!caseRow.rows[0]) {
      const err = new Error('Case not found.');
      err.status = 404;
      throw err;
    }

    const qcRow = await client.query(
      'SELECT id, case_id, overall_status FROM case_qc_results WHERE id = $1',
      [input.caseQcResultId]
    );
    const qcResult = qcRow.rows[0];
    if (!qcResult) {
      const err = new Error('caseQcResultId does not reference an existing QC result.');
      err.status = 400;
      throw err;
    }
    if (String(qcResult.case_id) !== String(caseId)) {
      const err = new Error('That QC result does not belong to this case.');
      err.status = 400;
      throw err;
    }
    if (qcResult.overall_status !== 'Pass') {
      const err = new Error('Final approval requires a QC result with overall_status "Pass".');
      err.status = 409;
      throw err;
    }

    const existing = await client.query('SELECT id FROM case_final_approvals WHERE case_id = $1', [caseId]);
    if (existing.rows[0]) {
      const err = new Error('This case already has a final approval.');
      err.status = 409;
      throw err;
    }

    const approvalRow = await client.query(
      `INSERT INTO case_final_approvals (case_id, case_qc_result_id, approved_by, notes)
       VALUES ($1, $2, $3, $4)
       RETURNING id, case_id, case_qc_result_id, approved_by, notes, created_at`,
      [caseId, input.caseQcResultId, req.user.id, input.notes || null]
    );

    return approvalRow.rows[0];
  });

  return res.status(201).json({ finalApproval: result });
}

async function getFinalApproval(req, res) {
  const caseId = req.params.id;
  const { rows } = await query(
    `SELECT id, case_id, case_qc_result_id, approved_by, notes, created_at
     FROM case_final_approvals WHERE case_id = $1`,
    [caseId]
  );
  if (!rows[0]) {
    return res.status(404).json({ error: 'No final approval recorded for this case.' });
  }
  return res.json({ finalApproval: rows[0] });
}

module.exports = {
  createChecklist,
  listChecklists,
  recordQcResult,
  listQcResults,
  createCaseRework,
  listCaseRework,
  resolveCaseRework,
  createFinalApproval,
  getFinalApproval,
};
