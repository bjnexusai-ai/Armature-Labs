exports.shorthands = undefined;

// Session 8 — Part A. Additive only, no existing column altered/dropped.
//
// Confirmed against 0016_invoices_and_payments.js before writing this:
// `payments.method` is a plain `varchar(50)`, not an enum or
// CHECK-constrained column, so inserting 'Stripe' as a value requires no
// migration here — see the comment in stripe.controller.js (webhook
// handler) where that value is actually set, which is the one place this
// is documented in code.
//
// `practices.stripe_customer_id` is nullable and only populated on a
// practice's first Checkout Session — not backfilled retroactively for
// existing practices.
exports.up = (pgm) => {
  pgm.addColumns('payments', {
    stripe_payment_intent_id: {
      type: 'varchar(255)',
      comment: 'Nullable — only set for method=Stripe payments. Used for webhook idempotency (Stripe delivers at-least-once).',
    },
    stripe_checkout_session_id: {
      type: 'varchar(255)',
      comment: 'Nullable — only set for method=Stripe payments, recorded for traceability back to the Checkout Session that produced this payment.',
    },
  });

  // Belt-and-suspenders alongside the application-level idempotency check in
  // stripe.controller.js: Postgres unique constraints treat NULL as
  // distinct from every other NULL, so non-Stripe payments (which always
  // leave this column NULL) never conflict with each other — this only
  // ever fires for a genuine duplicate Stripe payment_intent, guarding
  // against Stripe's at-least-once webhook delivery even if the
  // application-level pre-insert check races.
  pgm.addConstraint('payments', 'payments_stripe_payment_intent_id_unique', {
    unique: 'stripe_payment_intent_id',
  });

  pgm.addColumns('practices', {
    stripe_customer_id: {
      type: 'varchar(255)',
      comment: 'Nullable — only populated on a practice\'s first Stripe Checkout Session, not backfilled retroactively.',
    },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('practices', ['stripe_customer_id']);
  pgm.dropConstraint('payments', 'payments_stripe_payment_intent_id_unique', { ifExists: true });
  pgm.dropColumns('payments', ['stripe_payment_intent_id', 'stripe_checkout_session_id']);
};
