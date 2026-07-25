exports.shorthands = undefined;

// Session 4 — QC §6 rework + final approval. DECISION (documented per the
// build prompt's own convention of recording ambiguous-point decisions in
// BUILD_LOG rather than silently picking one): case_rework does NOT drive
// current_status through the existing case state machine
// (services/caseStatusTransition.js + utils/caseStatus.js). That machine
// only permits forward moves plus two named exceptions (Hold/Delayed) and
// the narrow approval-revert map — a generic "send back for rework" isn't a
// legal transition there, and extending tested Session 2/3 logic is out of
// this session's scope. Rework is tracked independently here as its own
// audit trail; it does not write to cases.current_status.
exports.up = (pgm) => {
  pgm.createTable('case_rework', {
    id: { type: 'bigserial', primaryKey: true },
    case_id: {
      type: 'bigint',
      notNull: true,
      references: 'cases',
      onDelete: 'CASCADE',
    },
    case_qc_result_id: {
      type: 'bigint',
      references: 'case_qc_results',
      onDelete: 'SET NULL',
      comment: 'The failing QC run that triggered this rework, if any (rework can also be opened manually without a QC run).',
    },
    reason: { type: 'text', notNull: true },
    requested_by: {
      type: 'bigint',
      notNull: true,
      references: 'users',
      onDelete: 'RESTRICT',
    },
    resolved_at: { type: 'timestamptz', comment: 'Null while open.' },
    resolved_by: {
      type: 'bigint',
      references: 'users',
      onDelete: 'SET NULL',
    },
    resolution_notes: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('case_final_approvals', {
    id: { type: 'bigserial', primaryKey: true },
    case_id: {
      type: 'bigint',
      notNull: true,
      unique: true,
      references: 'cases',
      onDelete: 'CASCADE',
      comment: 'One final approval per case — unique constraint enforces it can only happen once.',
    },
    case_qc_result_id: {
      type: 'bigint',
      notNull: true,
      references: 'case_qc_results',
      onDelete: 'RESTRICT',
      comment: 'Must reference a Pass result — enforced at the app layer.',
    },
    approved_by: {
      type: 'bigint',
      notNull: true,
      references: 'users',
      onDelete: 'RESTRICT',
    },
    notes: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('case_rework', 'case_id');
  pgm.createIndex('case_rework', 'resolved_at');
};

exports.down = (pgm) => {
  pgm.dropTable('case_final_approvals');
  pgm.dropTable('case_rework');
};
