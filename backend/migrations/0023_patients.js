exports.up = (pgm) => {
  pgm.createTable('patients', {
    id: { type: 'bigserial', primaryKey: true },
    first_name: { type: 'varchar(100)', notNull: true },
    last_name: { type: 'varchar(100)', notNull: true },
    date_of_birth: { type: 'date' },
    email: { type: 'varchar(255)' },
    phone: { type: 'varchar(50)' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addColumn('cases', {
    patient_id: {
      type: 'bigint',
      notNull: false,
      references: 'patients',
      onDelete: 'SET NULL',
    },
  });

  pgm.createIndex('cases', 'patient_id');
};

exports.down = (pgm) => {
  pgm.dropColumn('cases', 'patient_id');
  pgm.dropTable('patients');
};
