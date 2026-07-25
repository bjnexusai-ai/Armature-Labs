exports.shorthands = undefined;

// Client's exact §8 field spec (see BUILD_LOG.md Session 3 for the media_id ->
// case_files decision — progress_photos doesn't exist until Session 5).
exports.up = (pgm) => {
  pgm.createType('approval_stage', ['design', 'bisque']);
  pgm.createType('approval_status', ['pending', 'approved', 'rejected']);

  pgm.createTable('approvals', {
    id: { type: 'bigserial', primaryKey: true },
    case_id: {
      type: 'bigint',
      notNull: true,
      references: 'cases',
      onDelete: 'CASCADE',
    },
    media_id: {
      type: 'bigint',
      notNull: true,
      references: 'case_files',
      onDelete: 'RESTRICT',
    },
    stage: { type: 'approval_stage', notNull: true },
    status: { type: 'approval_status', notNull: true, default: 'pending' },
    approved_by: {
      type: 'bigint',
      references: 'users',
      onDelete: 'SET NULL',
      comment: 'Null while pending. The portal user who approved or rejected.',
    },
    comments: {
      type: 'text',
      comment: 'Required on reject (enforced at the application layer, not a DB constraint, per §2b).',
    },
    responded_at: { type: 'timestamptz', comment: 'Null while pending.' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // Queried both ways: "pending approvals for a case" and "all pending
  // approvals across the practice" for a portal dashboard.
  pgm.createIndex('approvals', 'case_id');
  pgm.createIndex('approvals', 'status');
};

exports.down = (pgm) => {
  pgm.dropTable('approvals');
  pgm.dropType('approval_status');
  pgm.dropType('approval_stage');
};
