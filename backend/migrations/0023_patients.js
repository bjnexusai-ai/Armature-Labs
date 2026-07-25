exports.shorthands = undefined;

// Session 5.5 — Client-Spec Schema Completeness Patch, run after Session 5
// (0019-0022: case_notes/progress_photos/shipments/warranty_claims, 100/100
// tests passing). Closes a client-spec gap (Project Scope §8): the docx
// defines PATIENT as its own entity (patient_id, office_id, first_name,
// last_name), separate from CASE. Phase 1 build only ever had patient_name/
// patient_reference_id flattened onto `cases` — this migration adds the
// normalized table the client actually asked for.
//
// Transitional note: `cases.patient_id` is added NULLABLE, not NOT NULL.
// `cases.patient_name` / `patient_reference_id` are left in place rather than
// dropped in this migration — they still have live data from Sessions 1-5's
// seed/tests. Backfilling patient_id from patient_name and then flipping it
// to NOT NULL (and deciding whether to drop patient_name or keep it as a
// display cache) is application-layer work for whoever picks up Session 5.5's
// controller/seed changes, not a schema-only concern — flagged in BUILD_LOG.
exports.up = (pgm) => {
  pgm.createTable('patients', {
    id: { type: 'bigserial', primaryKey: true },
    practice_id: {
      type: 'bigint',
      notNull: true,
      references: 'practices',
      onDelete: 'RESTRICT',
      comment: 'Matches the docx §8 PATIENT.office_id — a patient belongs to one dental office.',
    },
    first_name: { type: 'varchar(100)', notNull: true },
    last_name: { type: 'varchar(100)', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('patients', 'practice_id');

  pgm.addColumn('cases', {
    patient_id: {
      type: 'bigint',
      references: 'patients',
      onDelete: 'SET NULL',
      comment: 'Nullable during transition — see migration header. Will become the source of truth for patient identity once backfilled.',
    },
  });

  pgm.createIndex('cases', 'patient_id');
};

exports.down = (pgm) => {
  pgm.dropColumn('cases', 'patient_id');
  pgm.dropTable('patients');
};
