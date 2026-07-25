exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createType('impression_type', ['Digital Scan', 'Physical Impression']);

  pgm.createTable('prescriptions', {
    id: { type: 'bigserial', primaryKey: true },
    case_id: {
      type: 'bigint',
      notNull: true,
      references: 'cases',
      onDelete: 'CASCADE',
    },
    tooth_numbers: { type: 'varchar(100)' },
    material: { type: 'varchar(100)' },
    shade: { type: 'varchar(50)' },
    margin_design: { type: 'varchar(100)' },
    impression_type: { type: 'impression_type' },
    special_instructions: { type: 'text' },
    created_by: {
      type: 'bigint',
      notNull: true,
      references: 'users',
      onDelete: 'RESTRICT',
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('prescriptions', 'case_id');
};

exports.down = (pgm) => {
  pgm.dropTable('prescriptions');
  pgm.dropType('impression_type');
};
