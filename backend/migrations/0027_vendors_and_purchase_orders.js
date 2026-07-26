exports.shorthands = undefined;

// Session 6 — Phase 3 restocking workflow. purchase_order_number
// auto-generates as PO-YYYY-NNNN via trigger, same pattern as invoices'
// invoice_number (0016_invoices_and_payments.js) and cases' case_number
// (0006_cases.js).
//
// purchase_order_items.quantity_received is a maintained column, updated
// by the procurement controller as receiving transactions land (mirrors
// materials.current_stock from 0026) — lets "is this PO fully received"
// be a plain column comparison instead of a join+SUM over
// material_stock_transactions on every PO read.
exports.up = (pgm) => {
  pgm.createType('purchase_order_status', ['Draft', 'Ordered', 'Partially Received', 'Received', 'Cancelled']);

  pgm.createTable('vendors', {
    id: { type: 'bigserial', primaryKey: true },
    name: { type: 'varchar(150)', notNull: true },
    contact_name: { type: 'varchar(150)' },
    email: { type: 'varchar(150)' },
    phone: { type: 'varchar(20)' },
    address: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.sql(`
    CREATE TRIGGER vendors_set_updated_at
    BEFORE UPDATE ON vendors
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  pgm.createTable('purchase_orders', {
    id: { type: 'bigserial', primaryKey: true },
    po_number: { type: 'varchar(30)', unique: true },
    vendor_id: {
      type: 'bigint',
      notNull: true,
      references: 'vendors',
      onDelete: 'RESTRICT',
    },
    status: { type: 'purchase_order_status', notNull: true, default: 'Draft' },
    notes: { type: 'text' },
    created_by: {
      type: 'bigint',
      references: 'users',
      onDelete: 'SET NULL',
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('purchase_order_items', {
    id: { type: 'bigserial', primaryKey: true },
    purchase_order_id: {
      type: 'bigint',
      notNull: true,
      references: 'purchase_orders',
      onDelete: 'CASCADE',
    },
    material_id: {
      type: 'bigint',
      notNull: true,
      references: 'materials',
      onDelete: 'RESTRICT',
    },
    quantity_ordered: { type: 'numeric(12,3)', notNull: true },
    unit_cost: { type: 'numeric(10,2)', notNull: true },
    quantity_received: {
      type: 'numeric(12,3)',
      notNull: true,
      default: 0,
      comment: 'Maintained balance — see migration header.',
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('purchase_orders', 'vendor_id');
  pgm.createIndex('purchase_orders', 'status');
  pgm.createIndex('purchase_order_items', 'purchase_order_id');
  pgm.createIndex('purchase_order_items', 'material_id');

  pgm.sql(`
    CREATE TRIGGER purchase_orders_set_updated_at
    BEFORE UPDATE ON purchase_orders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  pgm.sql(`CREATE SEQUENCE IF NOT EXISTS po_number_seq;`);

  pgm.sql(`
    CREATE OR REPLACE FUNCTION generate_po_number()
    RETURNS TRIGGER AS $$
    DECLARE
      next_val BIGINT;
    BEGIN
      IF NEW.po_number IS NULL THEN
        next_val := nextval('po_number_seq');
        NEW.po_number := 'PO-' || to_char(now(), 'YYYY') || '-' || lpad(next_val::text, 4, '0');
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.sql(`
    CREATE TRIGGER purchase_orders_generate_po_number
    BEFORE INSERT ON purchase_orders
    FOR EACH ROW EXECUTE FUNCTION generate_po_number();
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS purchase_orders_generate_po_number ON purchase_orders;');
  pgm.sql('DROP FUNCTION IF EXISTS generate_po_number();');
  pgm.sql('DROP SEQUENCE IF EXISTS po_number_seq;');
  pgm.sql('DROP TRIGGER IF EXISTS purchase_orders_set_updated_at ON purchase_orders;');
  pgm.sql('DROP TRIGGER IF EXISTS vendors_set_updated_at ON vendors;');
  pgm.dropTable('purchase_order_items');
  pgm.dropTable('purchase_orders');
  pgm.dropTable('vendors');
  pgm.dropType('purchase_order_status');
};
