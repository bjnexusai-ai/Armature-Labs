exports.shorthands = undefined;

// Session 6 — Phase 3 Inventory (Master Blueprint §11 Phase 3). Stock
// catalog: material_categories groups materials (e.g. "Zirconia",
// "Metals", "Impression Materials"); materials carries the per-item
// reorder threshold and a maintained current_stock balance.
//
// current_stock is a maintained column (same pattern as invoices.amount_paid
// in 0016_invoices_and_payments.js), kept in sync by the inventory
// controller inside a row-locked (FOR UPDATE) transaction on every stock
// transaction insert — not derived on read, to keep reorder-threshold
// checks a cheap indexed query rather than a SUM() over every transaction
// row ever written for that material.
exports.up = (pgm) => {
  pgm.createType('material_status', ['Active', 'Discontinued']);

  pgm.createTable('material_categories', {
    id: { type: 'bigserial', primaryKey: true },
    name: { type: 'varchar(150)', notNull: true, unique: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('materials', {
    id: { type: 'bigserial', primaryKey: true },
    category_id: {
      type: 'bigint',
      notNull: true,
      references: 'material_categories',
      onDelete: 'RESTRICT',
    },
    name: { type: 'varchar(150)', notNull: true },
    unit: {
      type: 'varchar(20)',
      notNull: true,
      comment: 'Free-text unit of measure this stock is tracked in (e.g. "g", "ml", "unit", "disc") — materials in this lab are too heterogeneous for a fixed enum.',
    },
    unit_cost: { type: 'numeric(10,2)', notNull: true, default: 0 },
    reorder_threshold: {
      type: 'numeric(12,3)',
      notNull: true,
      default: 0,
      comment: 'When current_stock falls at or below this, the material is due for restock.',
    },
    current_stock: {
      type: 'numeric(12,3)',
      notNull: true,
      default: 0,
      comment: 'Maintained balance — see migration header. Never written directly outside the inventory controller\'s transaction.',
    },
    status: { type: 'material_status', notNull: true, default: 'Active' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('materials', 'category_id');
  pgm.createIndex('materials', 'status');

  // set_updated_at() was defined once in 0002_users.js and is reused
  // project-wide — not redefined here.
  pgm.sql(`
    CREATE TRIGGER materials_set_updated_at
    BEFORE UPDATE ON materials
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS materials_set_updated_at ON materials;');
  pgm.dropTable('materials');
  pgm.dropTable('material_categories');
  pgm.dropType('material_status');
};
