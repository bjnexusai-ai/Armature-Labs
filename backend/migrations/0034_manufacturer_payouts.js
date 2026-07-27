exports.shorthands = undefined;

// Session 8 — Part B. `case_id` is nullable because a payout may cover a
// batch of production work rather than always tying to exactly one case
// (SESSION_8_PROMPT §2). `currency` defaults to `usd` — flagged as an
// assumption in the prompt itself, to be confirmed against the
// manufacturer's actual country/currency once #16 (Gap Audit) is resolved;
// not hard-coded as a CHECK/enum for that reason, just a plain default.
exports.up = (pgm) => {
  pgm.createType('manufacturer_payout_status', ['Pending', 'Paid', 'Failed']);

  pgm.createTable('manufacturer_payouts', {
    id: { type: 'bigserial', primaryKey: true },
    manufacturer_id: {
      type: 'bigint',
      notNull: true,
      references: 'manufacturers',
      onDelete: 'RESTRICT',
      comment: 'RESTRICT, not CASCADE — a manufacturer with payout history should never be deletable out from under its financial trail.',
    },
    case_id: {
      type: 'bigint',
      references: 'cases',
      onDelete: 'SET NULL',
      comment: 'Nullable — a payout may cover a batch of production work, not always one case.',
    },
    amount: { type: 'numeric(10,2)', notNull: true },
    currency: {
      type: 'varchar(3)',
      notNull: true,
      default: 'usd',
      comment: 'Assumption pending confirmation of the manufacturer\'s actual country/currency — see Gap Audit #16 and manufacturers.country.',
    },
    stripe_transfer_id: { type: 'varchar(255)' },
    status: { type: 'manufacturer_payout_status', notNull: true, default: 'Pending' },
    initiated_by: {
      type: 'bigint',
      references: 'users',
      onDelete: 'SET NULL',
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('manufacturer_payouts', 'manufacturer_id');
  pgm.createIndex('manufacturer_payouts', 'case_id');
  pgm.createIndex('manufacturer_payouts', 'status');

  pgm.sql(`
    CREATE TRIGGER manufacturer_payouts_set_updated_at
    BEFORE UPDATE ON manufacturer_payouts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS manufacturer_payouts_set_updated_at ON manufacturer_payouts;');
  pgm.dropTable('manufacturer_payouts');
  pgm.dropType('manufacturer_payout_status');
};
