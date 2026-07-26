const { z } = require('zod');
const { query } = require('../config/db');

// ─────────────────────────────────────────────────────────────────────────
// Practice contracts — internal-only (owner/office_manager), no dentist_client
// access at all; see 0029's migration header. Multiple rows per practice are
// allowed (a history), "current" = most recently created.
// ─────────────────────────────────────────────────────────────────────────

const createContractSchema = z
  .object({
    paymentTerms: z.string().min(1).max(100),
    creditLimit: z.coerce.number().nonnegative().default(0),
    salesRepId: z.coerce.number().int().positive().optional(),
    contractStartDate: z.string().min(1),
    contractEndDate: z.string().optional(),
  })
  .strict();

async function createContract(req, res) {
  const practiceId = req.params.id;
  const input = createContractSchema.parse(req.body);

  const practiceRow = await query('SELECT id FROM practices WHERE id = $1', [practiceId]);
  if (!practiceRow.rows[0]) {
    return res.status(404).json({ error: 'Practice not found.' });
  }

  if (input.salesRepId) {
    const repRow = await query('SELECT id FROM users WHERE id = $1', [input.salesRepId]);
    if (!repRow.rows[0]) {
      return res.status(400).json({ error: 'salesRepId does not reference an existing user.' });
    }
  }

  const { rows } = await query(
    `INSERT INTO practice_contracts
       (practice_id, payment_terms, credit_limit, sales_rep_id, contract_start_date, contract_end_date, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, practice_id, payment_terms, credit_limit, sales_rep_id, contract_start_date, contract_end_date, created_at`,
    [
      practiceId,
      input.paymentTerms,
      input.creditLimit.toFixed(2),
      input.salesRepId || null,
      input.contractStartDate,
      input.contractEndDate || null,
      req.user.id,
    ]
  );
  return res.status(201).json({ contract: rows[0] });
}

async function listContracts(req, res) {
  const practiceId = req.params.id;
  const { rows } = await query(
    `SELECT id, practice_id, payment_terms, credit_limit, sales_rep_id, contract_start_date, contract_end_date, created_at, updated_at
     FROM practice_contracts WHERE practice_id = $1 ORDER BY created_at DESC`,
    [practiceId]
  );
  return res.json({ contracts: rows });
}

// ─────────────────────────────────────────────────────────────────────────
// Practice notes — internal-only account interaction log (calls, pricing
// discussions). No visibility split (contrast with case_notes) — nothing
// here is ever client-visible.
// ─────────────────────────────────────────────────────────────────────────

const createPracticeNoteSchema = z.object({ body: z.string().min(1) }).strict();

async function createPracticeNote(req, res) {
  const practiceId = req.params.id;
  const input = createPracticeNoteSchema.parse(req.body);

  const practiceRow = await query('SELECT id FROM practices WHERE id = $1', [practiceId]);
  if (!practiceRow.rows[0]) {
    return res.status(404).json({ error: 'Practice not found.' });
  }

  const { rows } = await query(
    `INSERT INTO practice_notes (practice_id, author_id, body)
     VALUES ($1, $2, $3)
     RETURNING id, practice_id, author_id, body, created_at`,
    [practiceId, req.user.id, input.body]
  );
  return res.status(201).json({ note: rows[0] });
}

async function listPracticeNotes(req, res) {
  const practiceId = req.params.id;
  const { rows } = await query(
    `SELECT id, practice_id, author_id, body, created_at
     FROM practice_notes WHERE practice_id = $1 ORDER BY created_at DESC`,
    [practiceId]
  );
  return res.json({ notes: rows });
}

module.exports = {
  createContract,
  listContracts,
  createPracticeNote,
  listPracticeNotes,
};
