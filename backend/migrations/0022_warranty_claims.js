exports.shorthands = undefined;

// Session 5 — warranty_claims §5. Only openable against a case in a
// terminal (Delivered) state — enforced at the controller layer via a
// read-only import of TERMINAL_STATUS from utils/caseStatus.js, not a DB
// constraint (a DB CHECK can't reference another table's column, and a
// trigger here would edge toward modifying state-machine-adjacent logic,
// which is out of scope this session). filed_by can be a dentist_client
// (their own practice's case) or internal staff filing on a client's
// behalf — no separate portal permission flag exists for this in the
// client's original three (can_approve_photos / can_view_invoices /
// can_edit_patient_info), so any authenticated user with tenant access to
// the case may file, same access shape as approvals' tenant check.
exports.up = (pgm) => {
  pgm.createType('warranty_claim_status', ['Open', 'Under Review', 'Approved', 'Denied', 'Resolved']);

  pgm.createTable('warranty_claims', {
    id: { type: 'bigserial', primaryKey: true },
    case_id: {
      type: 'bigint',
      notNull: true,
      references: 'cases',
      onDelete: 'CASCADE',
    },
    filed_by: {
      type: 'bigint',
      notNull: true,
      references: 'users',
      onDelete: 'RESTRICT',
    },
    description: { type: 'text', notNull: true },
    status: { type: 'warranty_claim_status', notNull: true, default: 'Open' },
    resolution_notes: { type: 'text' },
    resolved_by: {
      type: 'bigint',
      references: 'users',
      onDelete: 'SET NULL',
    },
    resolved_at: { type: 'timestamptz', comment: 'Null while open/under review.' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('warranty_claims', 'case_id');
  pgm.createIndex('warranty_claims', 'status');
};

exports.down = (pgm) => {
  pgm.dropTable('warranty_claims');
  pgm.dropType('warranty_claim_status');
};
