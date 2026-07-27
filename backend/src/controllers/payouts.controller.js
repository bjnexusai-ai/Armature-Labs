const { z } = require('zod');
const { query } = require('../config/db');
const stripe = require('../services/stripeClient');

// Kept as its own file rather than folded into manufacturers.controller.js
// (SESSION_8_PROMPT §3 leaves this as "developer's call, note the decision
// either way") — split out because payout creation touches Stripe Connect
// transfers, a distinct concern from manufacturer CRUD/onboarding, and
// keeping it separate mirrors how stripe.controller.js is split from
// billing.controller.js elsewhere in this session.

const createPayoutSchema = z
  .object({
    caseId: z.coerce.number().int().positive().optional(),
    amount: z.coerce.number().positive(),
    currency: z.string().length(3).optional(),
  })
  .strict();

async function createPayout(req, res) {
  const manufacturerId = req.params.id;
  const input = createPayoutSchema.parse(req.body);

  const { rows } = await query(
    'SELECT id, stripe_connected_account_id, connect_status FROM manufacturers WHERE id = $1',
    [manufacturerId]
  );
  const manufacturer = rows[0];
  if (!manufacturer) {
    return res.status(404).json({ error: 'Manufacturer not found.' });
  }
  if (!manufacturer.stripe_connected_account_id) {
    return res.status(400).json({
      error: 'This manufacturer has not completed Stripe Connect onboarding yet — generate an onboarding link first.',
    });
  }

  if (input.caseId) {
    const caseRow = await query('SELECT id FROM cases WHERE id = $1', [input.caseId]);
    if (!caseRow.rows[0]) {
      return res.status(400).json({ error: `caseId ${input.caseId} does not reference an existing case.` });
    }
  }

  const currency = (input.currency || 'usd').toLowerCase();

  // The initial insert happens in its own transaction first (committed
  // immediately) so the Pending row survives regardless of what happens
  // next — a thrown error inside withTransaction rolls back everything in
  // that block, and we do NOT want a failed Stripe call to also erase the
  // record that a payout was ever attempted.
  const payoutRow = await query(
    `INSERT INTO manufacturer_payouts (manufacturer_id, case_id, amount, currency, status, initiated_by)
     VALUES ($1, $2, $3, $4, 'Pending', $5)
     RETURNING id, manufacturer_id, case_id, amount, currency, stripe_transfer_id, status, created_at`,
    [manufacturerId, input.caseId || null, input.amount.toFixed(2), currency, req.user.id]
  );
  const payout = payoutRow.rows[0];

  try {
    const transfer = await stripe.transfers.create({
      amount: Math.round(input.amount * 100),
      currency,
      destination: manufacturer.stripe_connected_account_id,
      metadata: { manufacturerPayoutId: String(payout.id) },
    });

    const { rows: updated } = await query(
      `UPDATE manufacturer_payouts SET stripe_transfer_id = $1, status = 'Paid' WHERE id = $2
       RETURNING id, manufacturer_id, case_id, amount, currency, stripe_transfer_id, status, updated_at`,
      [transfer.id, payout.id]
    );
    return res.status(201).json({ payout: updated[0] });
  } catch (err) {
    const { rows: failed } = await query(
      `UPDATE manufacturer_payouts SET status = 'Failed' WHERE id = $1
       RETURNING id, manufacturer_id, case_id, amount, currency, stripe_transfer_id, status, updated_at`,
      [payout.id]
    );
    // The payout row persists as Failed (visible via GET .../payouts) even
    // though this request reports the error rather than a 201.
    return res.status(402).json({ error: `Stripe transfer failed: ${err.message}`, payout: failed[0] });
  }
}

async function listPayouts(req, res) {
  const manufacturerId = req.params.id;
  const manufacturerRow = await query('SELECT id FROM manufacturers WHERE id = $1', [manufacturerId]);
  if (!manufacturerRow.rows[0]) {
    return res.status(404).json({ error: 'Manufacturer not found.' });
  }

  const { rows } = await query(
    `SELECT id, manufacturer_id, case_id, amount, currency, stripe_transfer_id, status, initiated_by, created_at
     FROM manufacturer_payouts WHERE manufacturer_id = $1 ORDER BY created_at DESC`,
    [manufacturerId]
  );
  return res.json({ payouts: rows });
}

module.exports = { createPayout, listPayouts };
