const { z } = require('zod');
const { query, withTransaction } = require('../config/db');
const { assertPracticeAccess } = require('../middleware/tenantIsolation');

// ─────────────────────────────────────────────────────────────────────────
// Fee schedules
// ─────────────────────────────────────────────────────────────────────────

const createFeeScheduleSchema = z
  .object({
    name: z.string().min(1).max(150),
    description: z.string().optional(),
    isDefault: z.boolean().optional().default(false),
    items: z
      .array(
        z.object({
          caseTypeId: z.coerce.number().int().positive(),
          unitPrice: z.coerce.number().nonnegative(),
        })
      )
      .optional()
      .default([]),
  })
  .strict();

async function createFeeSchedule(req, res) {
  const input = createFeeScheduleSchema.parse(req.body);

  const result = await withTransaction(async (client) => {
    const scheduleRow = await client.query(
      `INSERT INTO fee_schedules (name, description, is_default)
       VALUES ($1, $2, $3)
       RETURNING id, name, description, is_default, created_at`,
      [input.name, input.description || null, input.isDefault]
    );
    const schedule = scheduleRow.rows[0];

    const items = [];
    for (const item of input.items) {
      const caseTypeRow = await client.query('SELECT id FROM case_types WHERE id = $1', [item.caseTypeId]);
      if (!caseTypeRow.rows[0]) {
        const err = new Error(`caseTypeId ${item.caseTypeId} does not reference an existing case type.`);
        err.status = 400;
        throw err;
      }
      const itemRow = await client.query(
        `INSERT INTO fee_schedule_items (fee_schedule_id, case_type_id, unit_price)
         VALUES ($1, $2, $3)
         RETURNING id, case_type_id, unit_price`,
        [schedule.id, item.caseTypeId, item.unitPrice]
      );
      items.push(itemRow.rows[0]);
    }

    return { ...schedule, items };
  });

  return res.status(201).json({ feeSchedule: result });
}

async function listFeeSchedules(req, res) {
  const { rows: schedules } = await query(
    `SELECT id, name, description, is_default, created_at FROM fee_schedules ORDER BY name`
  );
  const { rows: items } = await query(
    `SELECT fee_schedule_id, id, case_type_id, unit_price FROM fee_schedule_items ORDER BY id`
  );
  const bySchedule = new Map();
  for (const item of items) {
    if (!bySchedule.has(item.fee_schedule_id)) bySchedule.set(item.fee_schedule_id, []);
    bySchedule.get(item.fee_schedule_id).push(item);
  }
  const result = schedules.map((s) => ({ ...s, items: bySchedule.get(s.id) || [] }));
  return res.json({ feeSchedules: result });
}

// PUT /api/practices/:id/fee-schedule — assign a practice's active fee schedule.
const setPracticeFeeScheduleSchema = z.object({ feeScheduleId: z.coerce.number().int().positive() }).strict();

async function setPracticeFeeSchedule(req, res) {
  const practiceId = req.params.id;
  const input = setPracticeFeeScheduleSchema.parse(req.body);

  const practiceRow = await query('SELECT id FROM practices WHERE id = $1', [practiceId]);
  if (!practiceRow.rows[0]) {
    return res.status(404).json({ error: 'Practice not found.' });
  }
  const scheduleRow = await query('SELECT id FROM fee_schedules WHERE id = $1', [input.feeScheduleId]);
  if (!scheduleRow.rows[0]) {
    return res.status(400).json({ error: 'feeScheduleId does not reference an existing fee schedule.' });
  }

  const { rows } = await query(
    `INSERT INTO practice_fee_schedules (practice_id, fee_schedule_id)
     VALUES ($1, $2)
     ON CONFLICT (practice_id) DO UPDATE SET fee_schedule_id = EXCLUDED.fee_schedule_id, updated_at = now()
     RETURNING practice_id, fee_schedule_id, updated_at`,
    [practiceId, input.feeScheduleId]
  );
  return res.json({ practiceFeeSchedule: rows[0] });
}

// ─────────────────────────────────────────────────────────────────────────
// Invoices
// ─────────────────────────────────────────────────────────────────────────

const createInvoiceSchema = z
  .object({
    practiceId: z.coerce.number().int().positive(),
    notes: z.string().optional(),
    lineItems: z
      .array(
        z.object({
          caseId: z.coerce.number().int().positive().optional(),
          description: z.string().min(1).max(255),
          quantity: z.coerce.number().int().positive().default(1),
          unitPrice: z.coerce.number().nonnegative(),
        })
      )
      .min(1, 'At least one line item is required.'),
  })
  .strict();

async function createInvoice(req, res) {
  const input = createInvoiceSchema.parse(req.body);

  const result = await withTransaction(async (client) => {
    const practiceRow = await client.query('SELECT id FROM practices WHERE id = $1', [input.practiceId]);
    if (!practiceRow.rows[0]) {
      const err = new Error('practiceId does not reference an existing practice.');
      err.status = 400;
      throw err;
    }

    const subtotal = input.lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);

    const invoiceRow = await client.query(
      `INSERT INTO invoices (practice_id, status, subtotal, notes, created_by)
       VALUES ($1, 'Sent', $2, $3, $4)
       RETURNING id, invoice_number, practice_id, status, subtotal, amount_paid, notes, created_at`,
      [input.practiceId, subtotal.toFixed(2), input.notes || null, req.user.id]
    );
    const invoice = invoiceRow.rows[0];

    const lineItems = [];
    for (const li of input.lineItems) {
      if (li.caseId) {
        const caseRow = await client.query('SELECT id, practice_id FROM cases WHERE id = $1', [li.caseId]);
        if (!caseRow.rows[0]) {
          const err = new Error(`caseId ${li.caseId} does not reference an existing case.`);
          err.status = 400;
          throw err;
        }
        if (String(caseRow.rows[0].practice_id) !== String(input.practiceId)) {
          const err = new Error(`Case ${li.caseId} does not belong to practiceId ${input.practiceId}.`);
          err.status = 400;
          throw err;
        }
      }
      const lineTotal = li.quantity * li.unitPrice;
      const liRow = await client.query(
        `INSERT INTO invoice_line_items (invoice_id, case_id, description, quantity, unit_price, line_total)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, case_id, description, quantity, unit_price, line_total`,
        [invoice.id, li.caseId || null, li.description, li.quantity, li.unitPrice.toFixed(2), lineTotal.toFixed(2)]
      );
      lineItems.push(liRow.rows[0]);
    }

    return { ...invoice, lineItems };
  });

  return res.status(201).json({ invoice: result });
}

/**
 * Internal staff (Owner/Office Manager only, via requireBillingAccess) see
 * all invoices. Portal (dentist_client) users see their own practice's
 * invoices, gated on can_view_invoices via requirePortalPermission at the
 * route level.
 */
async function listInvoices(req, res) {
  if (req.user.role === 'dentist_client') {
    const ids = req.user.practice_ids.length ? req.user.practice_ids : [-1];
    const { rows } = await query(
      `SELECT id, invoice_number, practice_id, status, subtotal, amount_paid, created_at
       FROM invoices WHERE practice_id = ANY($1::bigint[]) ORDER BY created_at DESC`,
      [ids]
    );
    return res.json({ invoices: rows });
  }

  const practiceFilter = req.query.practiceId ? [req.query.practiceId] : null;
  const { rows } = await query(
    `SELECT id, invoice_number, practice_id, status, subtotal, amount_paid, notes, created_at
     FROM invoices
     WHERE ($1::bigint IS NULL OR practice_id = $1::bigint)
     ORDER BY created_at DESC`,
    [practiceFilter ? practiceFilter[0] : null]
  );
  return res.json({ invoices: rows });
}

async function getInvoice(req, res) {
  const invoiceId = req.params.id;
  const { rows } = await query(
    `SELECT id, invoice_number, practice_id, status, subtotal, amount_paid, notes, created_by, created_at, updated_at
     FROM invoices WHERE id = $1`,
    [invoiceId]
  );
  const invoice = rows[0];
  if (!invoice) {
    return res.status(404).json({ error: 'Invoice not found.' });
  }
  assertPracticeAccess(req.user, invoice.practice_id);

  const { rows: lineItems } = await query(
    `SELECT id, case_id, description, quantity, unit_price, line_total
     FROM invoice_line_items WHERE invoice_id = $1 ORDER BY id`,
    [invoiceId]
  );
  const { rows: payments } = await query(
    `SELECT id, amount, method, reference_note, created_at FROM payments WHERE invoice_id = $1 ORDER BY created_at`,
    [invoiceId]
  );

  return res.json({ invoice: { ...invoice, lineItems, payments } });
}

// ─────────────────────────────────────────────────────────────────────────
// Payments — manual mark-paid only this session (Stripe is Session 8).
// ─────────────────────────────────────────────────────────────────────────

const recordPaymentSchema = z
  .object({
    amount: z.coerce.number().positive(),
    method: z.string().min(1).max(50),
    referenceNote: z.string().max(255).optional(),
  })
  .strict();

async function recordPayment(req, res) {
  const invoiceId = req.params.id;
  const input = recordPaymentSchema.parse(req.body);

  const result = await withTransaction(async (client) => {
    // Row-locked so two simultaneous payments can't both read a stale
    // amount_paid and mis-derive the resulting status.
    const invoiceRow = await client.query(
      `SELECT id, practice_id, status, subtotal, amount_paid FROM invoices WHERE id = $1 FOR UPDATE`,
      [invoiceId]
    );
    const invoice = invoiceRow.rows[0];
    if (!invoice) {
      const err = new Error('Invoice not found.');
      err.status = 404;
      throw err;
    }
    if (invoice.status === 'Void') {
      const err = new Error('Cannot record a payment against a Void invoice.');
      err.status = 409;
      throw err;
    }

    const paymentRow = await client.query(
      `INSERT INTO payments (invoice_id, amount, method, reference_note, recorded_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, amount, method, reference_note, created_at`,
      [invoiceId, input.amount.toFixed(2), input.method, input.referenceNote || null, req.user.id]
    );

    const newAmountPaid = Number(invoice.amount_paid) + input.amount;
    const subtotal = Number(invoice.subtotal);
    // Partial-payment-safe: overpayment isn't rejected (real-world checks can
    // overshoot slightly), but status only ever advances to Paid, never
    // beyond it — auto-marks Paid the moment amount_paid meets or exceeds
    // subtotal.
    const newStatus = newAmountPaid >= subtotal ? 'Paid' : 'Partially Paid';

    const updatedInvoiceRow = await client.query(
      `UPDATE invoices SET amount_paid = $1, status = $2 WHERE id = $3
       RETURNING id, invoice_number, practice_id, status, subtotal, amount_paid, updated_at`,
      [newAmountPaid.toFixed(2), newStatus, invoiceId]
    );

    return { payment: paymentRow.rows[0], invoice: updatedInvoiceRow.rows[0] };
  });

  return res.status(201).json(result);
}

module.exports = {
  createFeeSchedule,
  listFeeSchedules,
  setPracticeFeeSchedule,
  createInvoice,
  listInvoices,
  getInvoice,
  recordPayment,
};
