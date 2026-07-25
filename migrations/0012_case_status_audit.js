exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('case_status_audit', {
    id: { type: 'bigserial', primaryKey: true },
    case_id: {
      type: 'bigint',
      notNull: true,
      references: 'cases',
      onDelete: 'CASCADE',
    },
    changed_by: {
      type: 'bigint',
      notNull: true,
      references: 'users',
      onDelete: 'RESTRICT',
    },
    old_status: { type: 'varchar(50)' },
    new_status: { type: 'varchar(50)', notNull: true },
    remarks: { type: 'text' },
    changed_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('case_status_audit', 'case_id');
};

exports.down = (pgm) => {
  pgm.dropTable('case_status_audit');
};
