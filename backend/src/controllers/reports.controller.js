const { z } = require('zod');
const { query } = require('../config/db');

// ─────────────────────────────────────────────────────────────────────────
// Saved reports — reusable filter configs, per-user (§11 Phase 3). Report
// *generation* (actually running Case Volume/Revenue/etc against live
// Phase 1/2/3 data) is out of scope for Session 7; this is presets only.
// Revenue-type presets are gated to Owner/Office Manager, mirroring the
// live Revenue Report's own §4.12 restriction.
// ─────────────────────────────────────────────────────────────────────────

const REPORT_TYPES = [
  'Case Volume',
  'Turnaround Time',
  'Approval Response Time',
  'On Hold And Delayed',
  'Upcoming Due Dates',
  'Revenue',
  'Client Activity',
];

const createSavedReportSchema = z
  .object({
    name: z.string().min(1).max(150),
    reportType: z.enum(REPORT_TYPES),
    filters: z.record(z.string(), z.any()).default({}),
  })
  .strict();

function assertRevenueAllowed(req, reportType) {
  if (reportType === 'Revenue' && !['owner', 'office_manager'].includes(req.user.role)) {
    const err = new Error('Revenue reports are restricted to Owner and Office Manager.');
    err.status = 403;
    throw err;
  }
}

async function createSavedReport(req, res) {
  const input = createSavedReportSchema.parse(req.body);
  assertRevenueAllowed(req, input.reportType);

  const { rows } = await query(
    `INSERT INTO saved_reports (owner_id, name, report_type, filters)
     VALUES ($1, $2, $3, $4)
     RETURNING id, owner_id, name, report_type, filters, created_at, updated_at`,
    [req.user.id, input.name, input.reportType, JSON.stringify(input.filters)]
  );
  return res.status(201).json({ savedReport: rows[0] });
}

async function listSavedReports(req, res) {
  // Own reports only — these are per-user presets, not lab-shared, so no
  // Owner/Office Manager "see everyone's" override; matches §11's "reusable
  // report filter configs" being a personal convenience feature, not a
  // shared-account resource like practice_notes.
  const { rows } = await query(
    `SELECT id, owner_id, name, report_type, filters, created_at, updated_at
     FROM saved_reports WHERE owner_id = $1 ORDER BY updated_at DESC`,
    [req.user.id]
  );
  return res.json({ savedReports: rows.filter((r) => r.report_type !== 'Revenue' || ['owner', 'office_manager'].includes(req.user.role)) });
}

async function deleteSavedReport(req, res) {
  const { id } = req.params;
  const existing = await query('SELECT id, owner_id FROM saved_reports WHERE id = $1', [id]);
  if (!existing.rows[0]) {
    return res.status(404).json({ error: 'Saved report not found.' });
  }
  if (existing.rows[0].owner_id !== req.user.id && req.user.role !== 'owner') {
    return res.status(403).json({ error: 'You can only delete your own saved reports.' });
  }
  await query('DELETE FROM saved_reports WHERE id = $1', [id]);
  return res.status(204).send();
}

module.exports = { createSavedReport, listSavedReports, deleteSavedReport };
