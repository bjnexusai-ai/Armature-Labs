exports.shorthands = undefined;

// Session 4 — QC §6. qc_checklists are named templates (optionally scoped to
// a case_type, nullable = applies to any case_type); qc_checklist_items are
// their ordered check lines; case_qc_results records one pass/fail run of a
// template against a specific case.
exports.up = (pgm) => {
  pgm.createTable('qc_checklists', {
    id: { type: 'bigserial', primaryKey: true },
    name: { type: 'varchar(150)', notNull: true },
    case_type_id: {
      type: 'integer',
      references: 'case_types',
      onDelete: 'CASCADE',
      comment: 'Null = generic checklist applicable to any case type.',
    },
    is_active: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('qc_checklist_items', {
    id: { type: 'bigserial', primaryKey: true },
    qc_checklist_id: {
      type: 'bigint',
      notNull: true,
      references: 'qc_checklists',
      onDelete: 'CASCADE',
    },
    item_text: { type: 'varchar(255)', notNull: true },
    sort_order: { type: 'integer', notNull: true, default: 0 },
  });

  pgm.createType('qc_result_status', ['Pass', 'Fail']);

  pgm.createTable('case_qc_results', {
    id: { type: 'bigserial', primaryKey: true },
    case_id: {
      type: 'bigint',
      notNull: true,
      references: 'cases',
      onDelete: 'CASCADE',
    },
    qc_checklist_id: {
      type: 'bigint',
      notNull: true,
      references: 'qc_checklists',
      onDelete: 'RESTRICT',
    },
    // Per-item results captured as JSON (array of { itemId, passed, note })
    // rather than a child table — this session's spec treats a QC run as one
    // atomic record, and there's no cross-run reporting requirement yet that
    // would need item rows to be individually queryable.
    item_results: { type: 'jsonb', notNull: true, default: '[]' },
    overall_status: { type: 'qc_result_status', notNull: true },
    performed_by: {
      type: 'bigint',
      notNull: true,
      references: 'users',
      onDelete: 'RESTRICT',
    },
    notes: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('qc_checklist_items', 'qc_checklist_id');
  pgm.createIndex('case_qc_results', 'case_id');
  pgm.createIndex('case_qc_results', 'qc_checklist_id');
};

exports.down = (pgm) => {
  pgm.dropTable('case_qc_results');
  pgm.dropType('qc_result_status');
  pgm.dropTable('qc_checklist_items');
  pgm.dropTable('qc_checklists');
};
