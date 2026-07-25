exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createType('stage_history_status', ['Pending', 'In Progress', 'Completed', 'Delayed']);

  pgm.createTable('case_stage_history', {
    id: { type: 'bigserial', primaryKey: true },
    case_id: {
      type: 'bigint',
      notNull: true,
      references: 'cases',
      onDelete: 'CASCADE',
    },
    stage_id: {
      type: 'integer',
      notNull: true,
      references: 'workflow_stages',
      onDelete: 'RESTRICT',
    },
    assigned_technician_id: {
      type: 'bigint',
      references: 'technicians',
      onDelete: 'SET NULL',
    },
    started_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    completed_at: { type: 'timestamptz' },
    status: { type: 'stage_history_status', notNull: true, default: 'Pending' },
    notes: { type: 'text' },
  });

  pgm.createIndex('case_stage_history', 'case_id');
  pgm.createIndex('case_stage_history', 'stage_id');
};

exports.down = (pgm) => {
  pgm.dropTable('case_stage_history');
  pgm.dropType('stage_history_status');
};
