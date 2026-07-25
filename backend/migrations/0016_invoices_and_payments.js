exports.shorthands = undefined;

// Session 4 — Billing §4.7. Manual mark-paid only this session (real
// Stripe/ACH is Session 8, per the confirmed scope delta). invoice_number
// auto-generates as INV-YYYY-NNNN via trigger, same pattern as cases'
// case_number (0006_cases.js).
exports.up = (pgm) => {
  pgm.createType('invoice_status', ['Draft', 'Sent', 'Partially Paid', 'Paid', 'Void']);

  pgm.createTable('invoices', {
    id: { type: 'bigserial', primaryKey: true },
    invoice_number: { type: 'varchar(30)', unique: true },
    practice_id: {
      type: 'bigint',
      notNull: true,
      references: 'practices',
      onDelete: 'RESTRICT',
    },
    status: { type: 'invoice_status', notNull: true, default: 'Draft' },
    subtotal: { type: 'numeric(10,2)', notNull: true, default: 0 },
    amount_paid: { type: 'numeric(10,2)', notNull: true, default: 0 },
    notes: { type: 'text' },
    created_by: {
      type: 'bigint',
      references: 'users',
      onDelete: 'SET NULL',
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('invoice_line_items', {
    id: { type: 'bigserial', primaryKey: true },
    invoice_id: {
      type: 'bigint',
      notNull: true,
      references: 'invoices',
      onDelete: 'CASCADE',
    },
    case_id: {
      type: 'bigint',
      references: 'cases',
      onDelete: 'SET NULL',
      comment: 'Nullable — a line item survives even if the underlying case record is later removed (it never is today, but RESTRICT would be over-strict here).',
    },
    description: { type: 'varchar(255)', notNull: true },
    quantity: { type: 'integer', notNull: true, default: 1 },
    unit_price: { type: 'numeric(10,2)', notNull: true },
    line_total: { type: 'numeric(10,2)', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('payments', {
    id: { type: 'bigserial', primaryKey: true },
    invoice_id: {
      type: 'bigint',
      notNull: true,
      references: 'invoices',
      onDelete: 'CASCADE',
    },
    amount: { type: 'numeric(10,2)', notNull: true },
    method: { type: 'varchar(50)', notNull: true, comment: 'Free-text this session (e.g. "Check", "Cash", "Bank Transfer") — no processor integration until Session 8.' },
    reference_note: { type: 'varchar(255)' },
    recorded_by: {
      type: 'bigint',
      references: 'users',
      onDelete: 'SET NULL',
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('invoices', 'practice_id');
  pgm.createIndex('invoices', 'status');
  pgm.createIndex('invoice_line_items', 'invoice_id');
  pgm.createIndex('payments', 'invoice_id');

  pgm.sql(`
    CREATE TRIGGER invoices_set_updated_at
    BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  pgm.sql(`CREATE SEQUENCE IF NOT EXISTS invoice_number_seq;`);

  pgm.sql(`
    CREATE OR REPLACE FUNCTION generate_invoice_number()
    RETURNS TRIGGER AS $$
    DECLARE
      next_val BIGINT;
    BEGIN
      IF NEW.invoice_number IS NULL THEN
        next_val := nextval('invoice_number_seq');
        NEW.invoice_number := 'INV-' || to_char(now(), 'YYYY') || '-' || lpad(next_val::text, 4, '0');
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.sql(`
    CREATE TRIGGER invoices_generate_invoice_number
    BEFORE INSERT ON invoices
    FOR EACH ROW EXECUTE FUNCTION generate_invoice_number();
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS invoices_generate_invoice_number ON invoices;');
  pgm.sql('DROP FUNCTION IF EXISTS generate_invoice_number();');
  pgm.sql('DROP SEQUENCE IF EXISTS invoice_number_seq;');
  pgm.sql('DROP TRIGGER IF EXISTS invoices_set_updated_at ON invoices;');
  pgm.dropTable('payments');
  pgm.dropTable('invoice_line_items');
  pgm.dropTable('invoices');
  pgm.dropType('invoice_status');
};
