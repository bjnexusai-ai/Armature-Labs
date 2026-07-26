exports.shorthands = undefined;

// Session 6 — Master Blueprint §11 Phase 3 CRM layer, nested under
// practices: practice_contracts ("payment terms, credit limit, assigned
// sales rep, contract dates — business-side account management, distinct
// from portal login") and practice_notes ("internal-only account
// interaction log — calls, pricing discussions").
//
// Both are internal-staff-only data — unlike case_notes (0019), there is
// no portal/internal visibility split here: a dentist_client never sees
// either table, full stop, so no visibility enum is needed.
//
// practice_contracts allows more than one row per practice (a history of
// contracts over time, newest = current) rather than a single mutable
// row — mirrors this project's own practice_fee_schedules-vs-fee_schedules
// separation of "current assignment" from "the thing being assigned";
// here there's no separate assignment table, so "most recent by
// created_at" is the read convention the controller uses for "current".
exports.up = (pgm) => {
  pgm.createTable('practice_contracts', {
    id: { type: 'bigserial', primaryKey: true },
    practice_id: {
      type: 'bigint',
      notNull: true,
      references: 'practices',
      onDelete: 'CASCADE',
    },
    payment_terms: {
      type: 'varchar(100)',
      notNull: true,
      comment: 'Free-text (e.g. "Net 30", "Due on Receipt") rather than an enum — terms vary by negotiated contract, not a fixed lab-wide list.',
    },
    credit_limit: { type: 'numeric(10,2)', notNull: true, default: 0 },
    sales_rep_id: {
      type: 'bigint',
      references: 'users',
      onDelete: 'SET NULL',
    },
    contract_start_date: { type: 'date', notNull: true },
    contract_end_date: { type: 'date' },
    created_by: {
      type: 'bigint',
      references: 'users',
      onDelete: 'SET NULL',
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('practice_notes', {
    id: { type: 'bigserial', primaryKey: true },
    practice_id: {
      type: 'bigint',
      notNull: true,
      references: 'practices',
      onDelete: 'CASCADE',
    },
    author_id: {
      type: 'bigint',
      references: 'users',
      onDelete: 'SET NULL',
    },
    body: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('practice_contracts', 'practice_id');
  pgm.createIndex('practice_notes', 'practice_id');

  pgm.sql(`
    CREATE TRIGGER practice_contracts_set_updated_at
    BEFORE UPDATE ON practice_contracts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS practice_contracts_set_updated_at ON practice_contracts;');
  pgm.dropTable('practice_notes');
  pgm.dropTable('practice_contracts');
};
