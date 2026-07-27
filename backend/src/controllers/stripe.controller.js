const stripe = require('../services/stripeClient');
const { query, withTransaction } = require('../config/db');
const { assertPracticeAccess } = require('../middleware/tenantIsolation');
const { applyPayment } = require('./billing.controller');

// Kept separate from billing.controller.js on purpose — see
// SESSION_8_PROMPT §3: this keeps webhook signature-verification logic out
// of the existing invoice CRUD file, at the cost of one cross-file import
// (`applyPayment`) so the payment-application/status-flip logic itself
// still isn't duplicated.

const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';

/**
 * POST /api/billing/invoices/:id/checkout-session
 *
 * Creates a Stripe Checkout Session for an invoice's outstanding balance.
 * The amount is always derived server-side from `subtotal - amount_paid` —
 * never taken from the request body, so a client can't supply an arbitrary
 * amount to pay.
 *
 * Route-level gating mirrors billing.routes.js's `requireInvoiceReadAccess`
 * composition (dentist_client with can_view_invoices, or internal
 * Owner/Office Manager) — see stripe.routes.js. `assertPracticeAccess` here
 * is the same tenant-isolation check `getInvoice` already performs, so a
 * portal user can't create a checkout session for another practice's
 * invoice even if they guess its numeric id.
 */
async function createCheckoutSession(req, res) {
  const invoiceId = req.params.id;

  const { rows } = await query(
    `SELECT id, invoice_number, practice_id, status, subtotal, amount_paid FROM invoices WHERE id = $1`,
    [invoiceId]
  );
  const invoice = rows[0];
  if (!invoice) {
    return res.status(404).json({ error: 'Invoice not found.' });
  }
  assertPracticeAccess(req.user, invoice.practice_id);

  if (invoice.status === 'Void') {
    return res.status(409).json({ error: 'Cannot create a checkout session for a Void invoice.' });
  }

  const outstanding = Number(invoice.subtotal) - Number(invoice.amount_paid);
  // Guard added per SESSION_8_PROMPT §3: reject rather than create a
  // Stripe session for an already-paid or zero-balance invoice.
  if (outstanding <= 0) {
    return res.status(400).json({ error: 'Invoice has no outstanding balance.' });
  }

  const { rows: practiceRows } = await query(
    'SELECT id, practice_name, stripe_customer_id FROM practices WHERE id = $1',
    [invoice.practice_id]
  );
  const practice = practiceRows[0];

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: practice.stripe_customer_id || undefined,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: `Invoice ${invoice.invoice_number}` },
          unit_amount: Math.round(outstanding * 100),
        },
        quantity: 1,
      },
    ],
    metadata: { invoiceId: String(invoice.id) },
    success_url: `${APP_BASE_URL}/invoices/${invoice.id}?payment=success`,
    cancel_url: `${APP_BASE_URL}/invoices/${invoice.id}?payment=cancelled`,
  });

  // Only populate practices.stripe_customer_id on a practice's first
  // Checkout Session (0035) — never overwrite/backfill it retroactively.
  if (!practice.stripe_customer_id && session.customer) {
    await query('UPDATE practices SET stripe_customer_id = $1 WHERE id = $2', [session.customer, practice.id]);
  }

  return res.status(201).json({ checkoutSession: { id: session.id, url: session.url } });
}

/**
 * POST /api/webhooks/stripe
 *
 * Must be mounted in app.js BEFORE the JSON body-parser — Stripe signature
 * verification needs the raw request body, not the parsed object. See the
 * mounting order in app.js and the comment there; this is flagged
 * explicitly per SESSION_8_PROMPT §3 since it's an easy thing to silently
 * break by adding routes in the wrong order later.
 *
 * No auth middleware on this route (Stripe can't send a JWT) — signature
 * verification via STRIPE_WEBHOOK_SECRET is the only gate. `tenantIsolation`
 * doesn't apply here either, deliberately (see stripe.routes.js / §5).
 */
async function handleWebhook(req, res) {
  const signature = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
  }

  const relevantTypes = ['checkout.session.completed', 'payment_intent.succeeded'];
  if (!relevantTypes.includes(event.type)) {
    // Not an event this handler acts on — still 200, so Stripe doesn't retry it.
    return res.status(200).json({ received: true });
  }

  const object = event.data.object;
  const paymentIntentId = event.type === 'payment_intent.succeeded' ? object.id : object.payment_intent;
  const checkoutSessionId = event.type === 'checkout.session.completed' ? object.id : null;
  const invoiceId = object.metadata && object.metadata.invoiceId;
  const amountTotal = object.amount_total != null ? object.amount_total : object.amount_received;

  if (!invoiceId || !paymentIntentId || amountTotal == null) {
    // Nothing we can act on (e.g. a Checkout Session unrelated to an
    // invoice, or one without a completed payment_intent yet) — 200 so
    // Stripe doesn't keep retrying an event we'll never be able to use.
    return res.status(200).json({ received: true, skipped: true });
  }

  // Idempotency pre-check: Stripe's delivery is at-least-once, so the same
  // event (or its payment_intent.succeeded / checkout.session.completed
  // pair for one payment) can arrive more than once. The partial-unique
  // constraint on payments.stripe_payment_intent_id (0035) is the real
  // guarantee; this is just the fast path that avoids a wasted insert
  // attempt on the common case.
  const existing = await query('SELECT id FROM payments WHERE stripe_payment_intent_id = $1', [paymentIntentId]);
  if (existing.rows[0]) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    await withTransaction((client) =>
      applyPayment(client, {
        invoiceId,
        amount: amountTotal / 100,
        // payments.method now also takes the value 'Stripe' alongside
        // Check/Cash/Bank Transfer (see 0035_stripe_payment_fields.js) —
        // this is the one place in code that value is actually set.
        method: 'Stripe',
        stripePaymentIntentId: paymentIntentId,
        stripeCheckoutSessionId: checkoutSessionId,
      })
    );
  } catch (err) {
    // A concurrent duplicate delivery that raced past the pre-check above
    // will land here as a unique_violation (23505) — treat it the same as
    // the pre-check catching it, not as a webhook failure Stripe should retry.
    if (err.code === '23505') {
      return res.status(200).json({ received: true, duplicate: true });
    }
    throw err;
  }

  return res.status(200).json({ received: true });
}

module.exports = { createCheckoutSession, handleWebhook };
