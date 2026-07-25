const { z } = require('zod');
const { query } = require('../config/db');
const { assertPracticeAccess } = require('../middleware/tenantIsolation');
const notifications = require('../services/notifications');

// ─────────────────────────────────────────────────────────────────────────
// Case notes — POST/GET /api/cases/:id/notes
//
// Per Master Blueprint §4.10 / §5 notification table: "Client Notes" are
// authored by the dental office too (not just staff) — the trigger table
// has both "New Client Note (from office) -> Assigned Staff" and "New
// Client Note (from lab) -> Dental Office", i.e. this is two-way messaging,
// not a staff-only log. So both internal staff and a dentist_client with
// tenant access to the case may create a note.
//
// DECISION: a dentist_client's note is ALWAYS visibility='portal' — there's
// no such thing as a client-authored internal-only note, and the client
// can't set internal visibility even if they send it (silently forced, not
// a 400 — matches the spirit of "portal only by explicit choice", the
// choice here is implicit in who's posting). Staff-authored notes keep the
// migration's documented default: 'internal' unless explicitly set to
// 'portal'.
// ─────────────────────────────────────────────────────────────────────────

const createNoteSchema = z
  .object({
    body: z.string().min(1),
    visibility: z.enum(['internal', 'portal']).optional(),
  })
  .strict();

async function createNote(req, res) {
  const caseId = req.params.id;
  const input = createNoteSchema.parse(req.body);

  const caseRow = await query('SELECT id, practice_id, assigned_staff_id FROM cases WHERE id = $1', [caseId]);
  const caseRecord = caseRow.rows[0];
  if (!caseRecord) {
    return res.status(404).json({ error: 'Case not found.' });
  }
  assertPracticeAccess(req.user, caseRecord.practice_id);

  const isPortalAuthor = req.user.role === 'dentist_client';
  const visibility = isPortalAuthor ? 'portal' : (input.visibility || 'internal');

  const { rows } = await query(
    `INSERT INTO case_notes (case_id, author_id, body, visibility)
     VALUES ($1, $2, $3, $4)
     RETURNING id, case_id, author_id, body, visibility, created_at`,
    [caseId, req.user.id, input.body, visibility]
  );
  const note = rows[0];

  // Notification table §5: "New Client Note (from office)" -> Assigned
  // Staff; "New Client Note (from lab)" -> Dental Office. Plain internal
  // notes (staff-authored, visibility='internal') aren't in the trigger
  // table at all, so no notification fires for those.
  if (isPortalAuthor) {
    if (caseRecord.assigned_staff_id) {
      await notifications.notify({
        event: 'client_note_created',
        recipientUserIds: [caseRecord.assigned_staff_id],
        payload: { caseId, noteId: note.id },
      });
    }
  } else if (visibility === 'portal') {
    const recipients = await query(
      `SELECT u.id FROM users u
       JOIN practice_users pu ON pu.user_id = u.id
       WHERE pu.practice_id = $1`,
      [caseRecord.practice_id]
    );
    if (recipients.rows.length) {
      await notifications.notify({
        event: 'lab_note_created',
        recipientUserIds: recipients.rows.map((r) => r.id),
        payload: { caseId, noteId: note.id },
      });
    }
  }

  return res.status(201).json({ note });
}

async function listNotes(req, res) {
  const caseId = req.params.id;

  const caseRow = await query('SELECT id, practice_id FROM cases WHERE id = $1', [caseId]);
  const caseRecord = caseRow.rows[0];
  if (!caseRecord) {
    return res.status(404).json({ error: 'Case not found.' });
  }
  assertPracticeAccess(req.user, caseRecord.practice_id);

  // A dentist_client only ever sees portal-visible notes — internal notes
  // never reach the portal, regardless of tenant access to the case.
  const conditions = ['case_id = $1'];
  const params = [caseId];
  if (req.user.role === 'dentist_client') {
    conditions.push(`visibility = 'portal'`);
  }

  const { rows } = await query(
    `SELECT id, case_id, author_id, body, visibility, created_at
     FROM case_notes WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
    params
  );
  return res.json({ notes: rows });
}

module.exports = { createNote, listNotes };
