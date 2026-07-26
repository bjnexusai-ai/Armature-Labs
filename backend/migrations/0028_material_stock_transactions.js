exports.shorthands = undefined;

// Session 6 — Master Blueprint §11 Phase 3: "every stock movement, WITH
// lot/batch number for regulatory traceability (which patient's case used
// which batch)". lot_number is therefore NOT NULL on every row, no
// exceptions — enforced here at the schema level, not just app-layer
// validation.
//
// quantity is SIGNED (positive = added to stock, negative = removed) —
// one column expresses every movement type instead of a separate
// direction flag that could disagree with the type. The inventory
// controller enforces the sign per type:
//   Receiving   -> always positive (stock arriving)
//   Consumption -> always negative (material used on a case)
//   Return      -> always negative (stock sent back to a vendor)
//   Adjustment  -> either sign, operator-supplied directly (a manual
//                  correction can go either way — forcing it to always
//                  mean "decrease" would be a hack; see controller).
// current_stock on `materials` is the running total of this column,
// maintained transactionally, never derived by summing this table on
// read (see 0026's header).
exports.up = (pgm) => {
  pgm.createType('stock_transaction_type', ['Receiving', 'Consumption', 'Adjustment', 'Return']);

  pgm.createTable('material_stock_transactions', {
    id: { type: 'bigserial', primaryKey: true },
    material_id: {
      type: 'bigint',
      notNull: true,
      references: 'materials',
      onDelete: 'RESTRICT',
    },
    type: { type: 'stock_transaction_type', notNull: true },
    quantity: { type: 'numeric(12,3)', notNull: true, comment: 'Signed — see migration header.' },
    lot_number: {
      type: 'varchar(100)',
      notNull: true,
      comment: 'Required on every row per Master Blueprint §11 Phase 3 regulatory traceability requirement — no exceptions, including Adjustment rows.',
    },
    case_id: {
      type: 'bigint',
      references: 'cases',
      onDelete: 'SET NULL',
      comment: 'Set for Consumption rows — which case used this batch. Null for Receiving/Return/most Adjustment rows.',
    },
    purchase_order_id: {
      type: 'bigint',
      references: 'purchase_orders',
      onDelete: 'SET NULL',
      comment: 'Set for Receiving rows sourced from a PO.',
    },
    performed_by: {
      type: 'bigint',
      references: 'users',
      onDelete: 'SET NULL',
    },
    notes: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('material_stock_transactions', 'material_id');
  pgm.createIndex('material_stock_transactions', 'case_id');
  pgm.createIndex('material_stock_transactions', 'purchase_order_id');
  pgm.createIndex('material_stock_transactions', 'type');
};

exports.down = (pgm) => {
  pgm.dropTable('material_stock_transactions');
  pgm.dropType('stock_transaction_type');
};
