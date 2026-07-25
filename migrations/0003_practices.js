exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createType('practice_status', ['Active', 'Inactive']);

  pgm.createTable('practices', {
    id: { type: 'bigserial', primaryKey: true },
    practice_name: { type: 'varchar(150)', notNull: true },
    address_line: { type: 'varchar(255)' },
    city: { type: 'varchar(100)' },
    state: { type: 'varchar(100)' },
    zip_code: { type: 'varchar(20)' },
    phone: { type: 'varchar(20)' },
    primary_contact_user_id: {
      type: 'bigint',
      references: 'users',
      onDelete: 'SET NULL',
    },
    internal_notes: { type: 'text' },
    status: { type: 'practice_status', notNull: true, default: 'Active' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('practices', 'status');
};

exports.down = (pgm) => {
  pgm.dropTable('practices');
  pgm.dropType('practice_status');
};
