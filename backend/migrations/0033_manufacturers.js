exports.shorthands = undefined;

// Session 8 — Part B (lab → manufacturer) groundwork. This is a genuine new
// entity, not a client-specified gap-fill (contrast Session 5.5's `patients`,
// which the client's own §8 spec already named) — see SESSION_8_PROMPT §0.3.
// `vendors` (Session 6 / 0027) is procurement-scoped (material suppliers) and
// is a different concept; this table is intentionally not a repurposing of
// it.
//
// `stripe_connected_account_id` is nullable because it's only populated
// after Connect onboarding completes, not at manufacturer-record creation —
// a manufacturer can exist in the system (name/contact/country) before any
// Stripe object exists for them at all. `connect_status` tracks where that
// onboarding stands independent of whether payouts have actually started.
exports.up = (pgm) => {
  pgm.createType('manufacturer_connect_status', ['Not Started', 'Onboarding', 'Active', 'Restricted']);

  pgm.createTable('manufacturers', {
    id: { type: 'bigserial', primaryKey: true },
    name: { type: 'varchar(150)', notNull: true },
    contact_name: { type: 'varchar(150)' },
    email: { type: 'varchar(255)' },
    phone: { type: 'varchar(30)' },
    country: {
      type: 'varchar(2)',
      notNull: true,
      comment: 'ISO 3166-1 alpha-2 country code — drives the Stripe Connect payout-support check (Gap Audit #16) before any account-link is generated.',
    },
    stripe_connected_account_id: {
      type: 'varchar(255)',
      comment: 'Nullable — populated after Connect onboarding, not at manufacturer creation.',
    },
    connect_status: { type: 'manufacturer_connect_status', notNull: true, default: 'Not Started' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('manufacturers', 'connect_status');

  pgm.sql(`
    CREATE TRIGGER manufacturers_set_updated_at
    BEFORE UPDATE ON manufacturers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS manufacturers_set_updated_at ON manufacturers;');
  pgm.dropTable('manufacturers');
  pgm.dropType('manufacturer_connect_status');
};
