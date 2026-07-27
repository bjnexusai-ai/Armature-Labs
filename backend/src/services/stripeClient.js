const Stripe = require('stripe');

/**
 * Single Stripe SDK instance, isolated in its own module so tests can
 * `jest.mock('stripe')` at the module boundary and never hit the real
 * Stripe API — same spirit as `notifications.js` being stubbed, flagged as
 * genuinely different in SESSION_8_PROMPT §6 since real money is involved,
 * hence real test-mode keys still being required for manual/staging
 * verification (see BUILD_LOG.md).
 *
 * Falls back to an obviously-fake placeholder key when STRIPE_SECRET_KEY
 * isn't set, so requiring this module never throws in environments (like
 * CI) where the Stripe SDK is mocked anyway and a real key is never read.
 */
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder_key_not_a_real_key', {
  apiVersion: '2024-06-20',
});

module.exports = stripe;
