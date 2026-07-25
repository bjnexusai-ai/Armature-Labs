exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createType('case_file_type', ['STL', '3Shape', 'Exocad', 'Image', 'Video', 'PDF', 'Other']);
  pgm.createType('media_stage', [
    'pickup_form',
    'pre_treatment',
    'design',
    'bisque',
    'final',
  ]);

  pgm.createTable('case_files', {
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
    file_name: { type: 'varchar(255)', notNull: true },
    file_type: { type: 'case_file_type', notNull: true },
    // Per Project Scope §4.6 media categories — nullable since not every case_file
    // (e.g. a signed PDF prescription) belongs to a review-media category.
    media_stage: { type: 'media_stage' },
    file_url: { type: 'varchar(500)', notNull: true },
    version_number: { type: 'integer', notNull: true, default: 1 },
    uploaded_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('case_files', 'case_id');
  pgm.createIndex('case_files', 'media_stage');
};

exports.down = (pgm) => {
  pgm.dropTable('case_files');
  pgm.dropType('case_file_type');
  pgm.dropType('media_stage');
};
