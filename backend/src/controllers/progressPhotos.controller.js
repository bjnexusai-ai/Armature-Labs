const { z } = require('zod');
const { query } = require('../config/db');
const { assertPracticeAccess } = require('../middleware/tenantIsolation');

// ─────────────────────────────────────────────────────────────────────────
// progress_photos — POST/GET /api/cases/:id/progress-photos
//
// Per migrations/0020_progress_photos.js: a separate, simpler table from
// case_files/approvals — ad-hoc production shots, no approval gate, no
// media_stage. DECISION: lab-staff only, both to create and to view. The
// client's three portal permission flags (can_approve_photos,
// can_view_invoices, can_edit_patient_info) don't cover "view progress
// shots", and unlike case_notes there's no notification-table entry or
// blueprint line putting these in front of the dental office — treating
// them as an internal production-tracking aid (not a client-facing
// gallery) is the more defensible reading pending an explicit client
// answer. Wired with requireInternal at the route level.
// ─────────────────────────────────────────────────────────────────────────

const createProgressPhotoSchema = z
  .object({
    fileUrl: z.string().min(1).max(500),
    caption: z.string().max(255).optional(),
    takenAt: z.string().datetime().optional(),
  })
  .strict();

async function createProgressPhoto(req, res) {
  const caseId = req.params.id;
  const input = createProgressPhotoSchema.parse(req.body);

  const caseRow = await query('SELECT id FROM cases WHERE id = $1', [caseId]);
  if (!caseRow.rows[0]) {
    return res.status(404).json({ error: 'Case not found.' });
  }

  const { rows } = await query(
    `INSERT INTO progress_photos (case_id, uploaded_by, file_url, caption, taken_at)
     VALUES ($1, $2, $3, $4, COALESCE($5, now()))
     RETURNING id, case_id, uploaded_by, file_url, caption, taken_at, created_at`,
    [caseId, req.user.id, input.fileUrl, input.caption || null, input.takenAt || null]
  );

  return res.status(201).json({ progressPhoto: rows[0] });
}

async function listProgressPhotos(req, res) {
  const caseId = req.params.id;

  const caseRow = await query('SELECT id, practice_id FROM cases WHERE id = $1', [caseId]);
  const caseRecord = caseRow.rows[0];
  if (!caseRecord) {
    return res.status(404).json({ error: 'Case not found.' });
  }
  // requireInternal already blocks dentist_client at the route, but keep
  // the tenant check too — cheap, and consistent with every other
  // case-scoped read in this codebase.
  assertPracticeAccess(req.user, caseRecord.practice_id);

  const { rows } = await query(
    `SELECT id, case_id, uploaded_by, file_url, caption, taken_at, created_at
     FROM progress_photos WHERE case_id = $1 ORDER BY taken_at DESC`,
    [caseId]
  );
  return res.json({ progressPhotos: rows });
}

module.exports = { createProgressPhoto, listProgressPhotos };
