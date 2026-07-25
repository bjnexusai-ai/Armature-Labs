exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createType('user_status', ['Active', 'Inactive', 'Suspended']);

  pgm.createTable('users', {
    id: { type: 'bigserial', primaryKey: true },
    full_name: { type: 'varchar(150)', notNull: true },
    email: { type: 'varchar(150)', notNull: true, unique: true },
    phone: { type: 'varchar(20)' },
    password_hash: { type: 'varchar(255)', notNull: true },
    role_id: {
      type: 'integer',
      notNull: true,
      references: 'roles',
      onDelete: 'RESTRICT',
    },
    status: { type: 'user_status', notNull: true, default: 'Active' },

    // Client-specified (Project Scope §8) portal permission flags — applicable to the
    // dentist_client role. Kept directly on users per the client's own field spec,
    // not split into a separate permissions table.
    can_approve_photos: { type: 'boolean', notNull: true, default: false },
    can_view_invoices: { type: 'boolean', notNull: true, default: false },
    can_edit_patient_info: { type: 'boolean', notNull: true, default: false },

    last_login_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('users', 'role_id');
  pgm.createIndex('users', 'email');

  // keep updated_at current on every row update
  pgm.sql(`
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.sql(`
    CREATE TRIGGER users_set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS users_set_updated_at ON users;');
  pgm.sql('DROP FUNCTION IF EXISTS set_updated_at();');
  pgm.dropTable('users');
  pgm.dropType('user_status');
};
