exports.shorthands = undefined;

// Session 7 — Master Blueprint §11 Phase 3: "technician_shifts,
// equipment_bookings — capacity planning, prevents double-booking machine
// time against cases".
//
// Both tables use a start/end timestamptz pair plus a partial-overlap
// exclusion enforced at the controller layer (via an overlap query before
// insert), not a Postgres EXCLUDE constraint — this project has no
// btree_gist extension enabled elsewhere and adding one for two tables
// didn't seem worth the new precedent; matches the "check-then-insert
// inside a transaction" pattern already used for double-booking-style
// checks elsewhere in this codebase (e.g. case_stage_history assignment).
exports.up = (pgm) => {
  pgm.createTable('technician_shifts', {
    id: { type: 'bigserial', primaryKey: true },
    technician_id: {
      type: 'bigint',
      notNull: true,
      references: 'technicians',
      onDelete: 'CASCADE',
    },
    starts_at: { type: 'timestamptz', notNull: true },
    ends_at: { type: 'timestamptz', notNull: true },
    notes: { type: 'text' },
    created_by: {
      type: 'bigint',
      references: 'users',
      onDelete: 'SET NULL',
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('equipment_bookings', {
    id: { type: 'bigserial', primaryKey: true },
    equipment_id: {
      type: 'bigint',
      notNull: true,
      references: 'equipment',
      onDelete: 'CASCADE',
    },
    case_id: {
      type: 'bigint',
      references: 'cases',
      onDelete: 'SET NULL',
      comment: 'Optional — a booking can be for general/non-case machine time (e.g. maintenance block).',
    },
    booked_by: {
      type: 'bigint',
      references: 'users',
      onDelete: 'SET NULL',
    },
    starts_at: { type: 'timestamptz', notNull: true },
    ends_at: { type: 'timestamptz', notNull: true },
    notes: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('technician_shifts', 'technician_shifts_ends_after_starts', {
    check: 'ends_at > starts_at',
  });
  pgm.addConstraint('equipment_bookings', 'equipment_bookings_ends_after_starts', {
    check: 'ends_at > starts_at',
  });

  pgm.createIndex('technician_shifts', ['technician_id', 'starts_at', 'ends_at']);
  pgm.createIndex('equipment_bookings', ['equipment_id', 'starts_at', 'ends_at']);
  pgm.createIndex('equipment_bookings', 'case_id');
};

exports.down = (pgm) => {
  pgm.dropTable('equipment_bookings');
  pgm.dropTable('technician_shifts');
};
