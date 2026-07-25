exports.shorthands = undefined;

// Session 5 — shipments §5. DECISION: creation is an explicit staff action
// (POST /api/cases/:id/shipments), NOT auto-fired off the case status
// machine. The build prompt's own guardrail forbids modifying
// utils/caseStatus.js or services/caseStatusTransition.js this session, and
// auto-creating a shipment as a side effect of PATCH /:id/status would mean
// guessing carrier/tracking details that endpoint doesn't collect today —
// an explicit endpoint keeps shipment data (carrier, tracking_number)
// staff-supplied and accurate rather than synthesized. One case can have
// more than one shipment record (e.g. a reshipment after a Session 5
// warranty claim), so this is a one-to-many table, not a single column on
// cases.
exports.up = (pgm) => {
  pgm.createType('shipment_status', ['Preparing', 'Shipped', 'Delivered', 'Returned']);

  pgm.createTable('shipments', {
    id: { type: 'bigserial', primaryKey: true },
    case_id: {
      type: 'bigint',
      notNull: true,
      references: 'cases',
      onDelete: 'CASCADE',
    },
    carrier: { type: 'varchar(100)' },
    tracking_number: { type: 'varchar(100)' },
    status: { type: 'shipment_status', notNull: true, default: 'Preparing' },
    shipped_at: { type: 'timestamptz' },
    delivered_at: { type: 'timestamptz' },
    created_by: {
      type: 'bigint',
      notNull: true,
      references: 'users',
      onDelete: 'RESTRICT',
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('shipments', 'case_id');
  pgm.createIndex('shipments', 'status');
};

exports.down = (pgm) => {
  pgm.dropTable('shipments');
  pgm.dropType('shipment_status');
};
