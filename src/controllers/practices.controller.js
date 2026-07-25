const { z } = require('zod');
const { query } = require('../config/db');
const { assertPracticeAccess } = require('../middleware/tenantIsolation');

const createPracticeSchema = z.object({
  practiceName: z.string().min(1).max(150),
  addressLine: z.string().max(255).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  zipCode: z.string().max(20).optional(),
  phone: z.string().max(20).optional(),
  internalNotes: z.string().optional(),
});

async function createPractice(req, res) {
  const input = createPracticeSchema.parse(req.body);
  const { rows } = await query(
    `INSERT INTO practices (practice_name, address_line, city, state, zip_code, phone, internal_notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, practice_name, address_line, city, state, zip_code, phone, status, created_at`,
    [
      input.practiceName,
      input.addressLine || null,
      input.city || null,
      input.state || null,
      input.zipCode || null,
      input.phone || null,
      input.internalNotes || null,
    ]
  );
  return res.status(201).json({ practice: rows[0] });
}

/**
 * Internal staff see every practice. A dentist_client is restricted to their
 * own practice(s) — enforced here server-side, not just hidden in the UI.
 */
async function listPractices(req, res) {
  if (req.user.role === 'dentist_client') {
    const ids = req.user.practice_ids.length ? req.user.practice_ids : [-1];
    const { rows } = await query(
      `SELECT id, practice_name, address_line, city, state, zip_code, phone, status
       FROM practices WHERE id = ANY($1::bigint[]) ORDER BY practice_name`,
      [ids]
    );
    return res.json({ practices: rows });
  }

  const { rows } = await query(
    `SELECT id, practice_name, address_line, city, state, zip_code, phone, status, created_at
     FROM practices ORDER BY practice_name`
  );
  return res.json({ practices: rows });
}

async function getPractice(req, res) {
  const practiceId = req.params.id;
  assertPracticeAccess(req.user, practiceId);

  const { rows } = await query(
    `SELECT id, practice_name, address_line, city, state, zip_code, phone, status, internal_notes, created_at
     FROM practices WHERE id = $1`,
    [practiceId]
  );
  if (!rows[0]) {
    return res.status(404).json({ error: 'Practice not found.' });
  }
  return res.json({ practice: rows[0] });
}

module.exports = { createPractice, listPractices, getPractice };
