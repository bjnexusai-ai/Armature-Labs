exports.shorthands = undefined;

// Session 7 — Master Blueprint §11 Phase 3, first of the 5 deferred tables.
//
// saved_reports: "reusable report filter configs (reports themselves are
// views over Phase 1/2/3 data, not duplicated storage)" — per §11 this
// table stores only the filter/config a user wants to re-run, never
// report output itself. Report generation (querying cases/invoices/etc
// live) is out of scope for this session; only the save/list/delete of
// filter presets is built here.
//
// report_type is a free-text-ish enum matching the Reporting module list
// from §4.12: Case Volume, Turnaround Time, Approval Response Time,
// On Hold & Delayed, Upcoming Due Dates/At-Risk, Revenue, Client Activity.
// Revenue is gated to Owner/Office Manager at the controller layer (per
// §4.12 "Revenue (Owner/Office Manager only)") — same restriction as the
// live Revenue Report itself, not just its saved filters, since a saved
// filter config for a report a user can't run is meaningless to expose.
exports.up = (pgm) => {
  pgm.createType('saved_report_type', [
    'Case Volume',
    'Turnaround Time',
    'Approval Response Time',
    'On Hold And Delayed',
    'Upcoming Due Dates',
    'Revenue',
    'Client Activity',
  ]);

  pgm.createTable('saved_reports', {
    id: { type: 'bigserial', primaryKey: true },
    owner_id: {
      type: 'bigint',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
      comment: 'The internal staff member who saved this filter config. Reports are per-user, not shared lab-wide.',
    },
    name: { type: 'varchar(150)', notNull: true },
    report_type: { type: 'saved_report_type', notNull: true },
    filters: {
      type: 'jsonb',
      notNull: true,
      default: '{}',
      comment: 'Arbitrary filter config (date range, practice_id, status, etc) — shape depends on report_type, validated loosely at the controller layer rather than with per-type DB constraints.',
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('saved_reports', 'owner_id');

  pgm.sql(`
    CREATE TRIGGER saved_reports_set_updated_at
    BEFORE UPDATE ON saved_reports
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS saved_reports_set_updated_at ON saved_reports;');
  pgm.dropTable('saved_reports');
  pgm.dropType('saved_report_type');
};
