exports.shorthands = undefined;

// Session 5 — progress_photos §5. Resolves the open question flagged at the
// end of Session 3 (BUILD_LOG.md): does progress_photos become the new home
// for approval-stage media currently living in case_files?
//
// DECISION: NO — approvals.media_id keeps referencing case_files, unchanged.
// case_files.media_stage already covers the 'design'/'bisque' approval-gate
// categories end-to-end (upload, approve, request-changes all already work
// against it, tested in Sessions 2-3), and repointing a working, tested FK
// for no functional gain — just to consolidate two tables that serve
// different purposes — would risk an unnecessary data migration and touch
// approvals.controller.js outside this session's stated scope. Instead,
// progress_photos is a SEPARATE, simpler table for ad-hoc production
// progress shots (e.g. "here's the case mid-processing") that were never
// part of the approval gate and have no case_file_type/version_number
// baggage to carry. No FK relationship between the two tables — they're
// parallel, not layered.
exports.up = (pgm) => {
  pgm.createTable('progress_photos', {
    id: { type: 'bigserial', primaryKey: true },
    case_id: {
      type: 'bigint',
      notNull: true,
      references: 'cases',
      onDelete: 'CASCADE',
    },
    uploaded_by: {
      type: 'bigint',
      notNull: true,
      references: 'users',
      onDelete: 'RESTRICT',
    },
    file_url: { type: 'varchar(500)', notNull: true },
    caption: { type: 'varchar(255)' },
    taken_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('progress_photos', 'case_id');
};

exports.down = (pgm) => {
  pgm.dropTable('progress_photos');
};
