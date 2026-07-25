exports.shorthands = undefined;

// Case status: the 10-state lifecycle is authoritative (resolved gap #12 — the client's
// docx §11.3 mockup 7-step tracker is internal sub-stage granularity, seeded separately
// into workflow_stages, not a competing state machine).
const CASE_STATUSES = [
  'Case Entered',
  'In Design',
  'Pending Design Approval',
  'Processing',
  'Pending Bisque Approval',
  'Finalizing',
  'Shipped Out',
  'Delivered',
  'Case on Hold',
  'Delayed',
];

exports.up = (pgm) => {
  pgm.createType('case_priority', ['Standard', 'Rush', 'Urgent']);
  pgm.createType('case_status', CASE_STATUSES);

  pgm.createTable('cases', {
    id: { type: 'bigserial', primaryKey: true },
    case_number: { type: 'varchar(30)', notNull: true, unique: true },
    practice_id: {
      type: 'bigint',
      notNull: true,
      references: 'practices',
      onDelete: 'RESTRICT',
    },
    dentist_id: {
      type: 'bigint',
      notNull: true,
      references: 'users',
      onDelete: 'RESTRICT',
    },
    case_type_id: {
      type: 'integer',
      notNull: true,
      references: 'case_types',
      onDelete: 'RESTRICT',
    },
    patient_name: { type: 'varchar(150)' },
    patient_reference_id: { type: 'varchar(50)' },
    rx_instructions: { type: 'text' },
    priority: { type: 'case_priority', notNull: true, default: 'Standard' },
    due_date: { type: 'date', notNull: true },
    current_status: { type: 'case_status', notNull: true, default: 'Case Entered' },
    prior_status: {
      type: 'case_status',
      comment: 'Status to revert to when Case on Hold / Delayed is cleared, or when a Request Changes reverts the case.',
    },
    assigned_staff_id: {
      type: 'bigint',
      references: 'users',
      onDelete: 'SET NULL',
    },
    notes: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('cases', 'practice_id');
  pgm.createIndex('cases', 'dentist_id');
  pgm.createIndex('cases', 'current_status');
  pgm.createIndex('cases', 'due_date');

  pgm.sql(`
    CREATE TRIGGER cases_set_updated_at
    BEFORE UPDATE ON cases
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // Auto-generated, human-readable case_number in the form CASE-YYYY-NNNNN,
  // sequence resets implicitly per year since NNNNN is derived from a per-year sequence.
  pgm.sql(`CREATE SEQUENCE IF NOT EXISTS case_number_seq;`);

  pgm.sql(`
    CREATE OR REPLACE FUNCTION generate_case_number()
    RETURNS TRIGGER AS $$
    DECLARE
      next_val BIGINT;
    BEGIN
      IF NEW.case_number IS NULL THEN
        next_val := nextval('case_number_seq');
        NEW.case_number := 'CASE-' || to_char(now(), 'YYYY') || '-' || lpad(next_val::text, 5, '0');
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.sql(`
    CREATE TRIGGER cases_generate_case_number
    BEFORE INSERT ON cases
    FOR EACH ROW EXECUTE FUNCTION generate_case_number();
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS cases_generate_case_number ON cases;');
  pgm.sql('DROP FUNCTION IF EXISTS generate_case_number();');
  pgm.sql('DROP SEQUENCE IF EXISTS case_number_seq;');
  pgm.sql('DROP TRIGGER IF EXISTS cases_set_updated_at ON cases;');
  pgm.dropTable('cases');
  pgm.dropType('case_status');
  pgm.dropType('case_priority');
};
