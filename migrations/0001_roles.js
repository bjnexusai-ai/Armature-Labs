exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('roles', {
    id: 'id',
    name: { type: 'varchar(50)', notNull: true, unique: true },
    description: { type: 'text' },
  });

  // Seed the fixed role list up front (owner, office_manager, assistant_technician,
  // designer, dentist_client) so FKs in later migrations/seed can rely on them existing.
  pgm.sql(`
    INSERT INTO roles (name, description) VALUES
      ('owner', 'Full internal access including billing/invoices. Ultimate decision-maker.'),
      ('office_manager', 'Full internal access including billing/invoices. Runs daily ops.'),
      ('assistant_technician', 'Case/patient/production/media/notes/dashboard/reporting access. Blocked from invoices, Revenue Report, user account management.'),
      ('designer', 'Same access as assistant_technician by default (no separate client-specified permission set exists).'),
      ('dentist_client', 'Dental office portal user. Office-isolated data only. Approve/invoice/edit-patient access gated per-user via boolean flags on the users table.')
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('roles');
};
