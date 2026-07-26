exports.shorthands = undefined;

// Session 7 — Master Blueprint §11 Phase 3: "equipment,
// equipment_maintenance_logs — milling machines, printers, furnaces,
// scanners + service history/next-due".
//
// equipment.next_maintenance_due_date is a maintained column (not derived
// live at read time) because it's the field the Due Date Alert System
// pattern (§4.4) would key off of for equipment, same "denormalized for
// alerting" shape as cases.due_date. It's updated whenever a maintenance
// log is created with a nextDueDate — see equipment.controller.js.
exports.up = (pgm) => {
  pgm.createType('equipment_type', ['Milling Machine', 'Printer', 'Furnace', 'Scanner', 'Other']);
  pgm.createType('equipment_status', ['Active', 'Under Maintenance', 'Retired']);
  pgm.createType('maintenance_log_type', ['Routine', 'Repair', 'Inspection']);

  pgm.createTable('equipment', {
    id: { type: 'bigserial', primaryKey: true },
    name: { type: 'varchar(150)', notNull: true },
    equipment_type: { type: 'equipment_type', notNull: true },
    serial_number: { type: 'varchar(100)' },
    status: { type: 'equipment_status', notNull: true, default: 'Active' },
    next_maintenance_due_date: {
      type: 'date',
      comment: 'Maintained column, kept in sync from equipment_maintenance_logs.next_due_date on each new log row. Null if no maintenance has ever been scheduled.',
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('equipment_maintenance_logs', {
    id: { type: 'bigserial', primaryKey: true },
    equipment_id: {
      type: 'bigint',
      notNull: true,
      references: 'equipment',
      onDelete: 'CASCADE',
    },
    log_type: { type: 'maintenance_log_type', notNull: true },
    performed_by: {
      type: 'bigint',
      references: 'users',
      onDelete: 'SET NULL',
    },
    performed_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    next_due_date: {
      type: 'date',
      comment: 'If set, equipment.next_maintenance_due_date is updated to this value. If omitted, the equipment row\'s existing next-due date is left untouched (see Session 7 bugfix — a log with no next date must not wipe a future date set by a prior log).',
    },
    notes: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('equipment_maintenance_logs', 'equipment_id');
  pgm.createIndex('equipment', 'status');

  pgm.sql(`
    CREATE TRIGGER equipment_set_updated_at
    BEFORE UPDATE ON equipment
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS equipment_set_updated_at ON equipment;');
  pgm.dropTable('equipment_maintenance_logs');
  pgm.dropTable('equipment');
  pgm.dropType('maintenance_log_type');
  pgm.dropType('equipment_status');
  pgm.dropType('equipment_type');
};
