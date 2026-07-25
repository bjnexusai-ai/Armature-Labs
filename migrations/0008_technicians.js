exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createType('technician_status', ['Active', 'Inactive']);

  pgm.createTable('technicians', {
    id: { type: 'bigserial', primaryKey: true },
    user_id: {
      type: 'bigint',
      notNull: true,
      unique: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    employee_code: { type: 'varchar(30)' },
    department: { type: 'varchar(100)' },
    specialty: { type: 'varchar(100)' },
    status: { type: 'technician_status', notNull: true, default: 'Active' },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('technicians');
  pgm.dropType('technician_status');
};
