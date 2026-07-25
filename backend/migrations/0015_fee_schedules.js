exports.shorthands = undefined;

// Session 4 — Billing §4.7. A fee_schedule is a named price list (e.g. "2026
// Standard", "Practice XYZ Contract Rate"); fee_schedule_items are its
// per-case-type line prices; practice_fee_schedules assigns exactly one
// active schedule per practice at a time (enforced at the app layer via the
// unique index below, not a partial-index trick, since node-pg-migrate's
// createIndex doesn't need one here — a practice has one row, period).
exports.up = (pgm) => {
  pgm.createTable('fee_schedules', {
    id: { type: 'bigserial', primaryKey: true },
    name: { type: 'varchar(150)', notNull: true },
    description: { type: 'text' },
    is_default: { type: 'boolean', notNull: true, default: false },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('fee_schedule_items', {
    id: { type: 'bigserial', primaryKey: true },
    fee_schedule_id: {
      type: 'bigint',
      notNull: true,
      references: 'fee_schedules',
      onDelete: 'CASCADE',
    },
    case_type_id: {
      type: 'integer',
      notNull: true,
      references: 'case_types',
      onDelete: 'RESTRICT',
    },
    unit_price: { type: 'numeric(10,2)', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('fee_schedule_items', 'fee_schedule_items_schedule_casetype_unique', {
    unique: ['fee_schedule_id', 'case_type_id'],
  });

  // One active fee schedule per practice (Owner/Office Manager-assigned; see
  // requireBillingAccess). A practice with no row here falls back to the
  // fee_schedules row where is_default = true, resolved at read time by the
  // billing controller rather than duplicated here.
  pgm.createTable('practice_fee_schedules', {
    id: { type: 'bigserial', primaryKey: true },
    practice_id: {
      type: 'bigint',
      notNull: true,
      unique: true,
      references: 'practices',
      onDelete: 'CASCADE',
    },
    fee_schedule_id: {
      type: 'bigint',
      notNull: true,
      references: 'fee_schedules',
      onDelete: 'RESTRICT',
    },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('fee_schedule_items', 'fee_schedule_id');

  pgm.sql(`
    CREATE TRIGGER practice_fee_schedules_set_updated_at
    BEFORE UPDATE ON practice_fee_schedules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS practice_fee_schedules_set_updated_at ON practice_fee_schedules;');
  pgm.dropTable('practice_fee_schedules');
  pgm.dropTable('fee_schedule_items');
  pgm.dropTable('fee_schedules');
};
