exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('system_settings', {
    setting_id: 'id',
    setting_key: { type: 'varchar(100)', notNull: true, unique: true },
    setting_value: { type: 'text', notNull: true },
    description: { type: 'text' },
    updated_by: {
      type: 'bigint',
      references: 'users',
      onDelete: 'SET NULL',
    },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.sql(`
    CREATE TRIGGER system_settings_set_updated_at
    BEFORE UPDATE ON system_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // Client-specified default (Project Scope §4.4 / §8): due-date warning window,
  // editable by Owner/Office Manager only (enforced at the route layer, not in schema).
  pgm.sql(`
    INSERT INTO system_settings (setting_key, setting_value, description) VALUES
      ('due_date_alert_threshold_days', '4', 'Days before due_date that a case enters the Dashboard "Due Soon" widget and triggers an alert.'),
      ('due_date_escalation_cadence_days', '1', 'How often the overdue escalation alert repeats until status changes or due_date is updated.')
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS system_settings_set_updated_at ON system_settings;');
  pgm.dropTable('system_settings');
};
