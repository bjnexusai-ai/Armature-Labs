exports.shorthands = undefined;

// Session 5.5 — Client-Spec Schema Completeness Patch, run after Session 5.
// Closes a client-spec gap (Project Scope §8): the docx's INVOICE entity is
// `(invoice_id, case_id, office_id, line_items, subtotal/tax/total, due_date,
// payment_status, paid_date)`. Session 4's 0016_invoices_and_payments.js
// built `subtotal`/`amount_paid`/`status` (=payment_status) but left out
// `due_date`, `tax_amount` (the "tax" in subtotal/tax/total), and `paid_date`
// — all three are explicitly named in the client's own document, not just
// the elaborated schema PDF.
exports.up = (pgm) => {
  pgm.addColumn('invoices', {
    due_date: { type: 'date' },
    tax_amount: { type: 'numeric(10,2)', notNull: true, default: 0 },
    paid_date: {
      type: 'date',
      comment: 'Set when the invoice fully transitions to Paid status — mirrors the docx §8 field directly on INVOICE, distinct from individual payments.created_at rows.',
    },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('invoices', 'paid_date');
  pgm.dropColumn('invoices', 'tax_amount');
  pgm.dropColumn('invoices', 'due_date');
};
