/**
 * Integration tests against a real Postgres instance (DATABASE_URL from .env).
 * Assumes migrations + seed have already been run. Run with: npm test
 *
 * The Stripe SDK itself is mocked at the module boundary (src/services/
 * stripeClient.js) — same spirit as notifications.js being stubbed
 * (SESSION_8_PROMPT §6), but flagged as genuinely different here since real
 * money is involved: real test-mode keys are still needed for manual/
 * staging verification, tracked in BUILD_LOG.md. Nothing in this file ever
 * hits the real Stripe API.
 */
jest.mock('../src/services/stripeClient', () => ({
  checkout: { sessions: { create: jest.fn() } },
  webhooks: { constructEvent: jest.fn() },
}));

const request = require('supertest');
const app = require('../src/app');
const { query } = require('../src/config/db');
const stripeClient = require('../src/services/stripeClient');

const PASSWORD = 'TestPass123!';

async function loginAs(email) {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.accessToken;
}

async function getPracticeId() {
  const { rows } = await query("SELECT id FROM practices WHERE practice_name = 'Bright Smile Dental Clinic'");
  return rows[0].id;
}

async function createInvoice(ownerToken, practiceId, unitPrice = 200) {
  const res = await request(app)
    .post('/api/billing/invoices')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ practiceId, lineItems: [{ description: 'Crown — Stripe test', quantity: 1, unitPrice }] });
  expect(res.status).toBe(201);
  return res.body.invoice;
}

function mockEvent(type, object) {
  return { id: `evt_${Date.now()}_${Math.random()}`, type, data: { object } };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Passes the raw Buffer straight through as parsed JSON — signature
  // verification itself is Stripe's own SDK internals, out of scope for
  // these tests; what we're testing is our handler's behavior given a
  // verified event.
  stripeClient.webhooks.constructEvent.mockImplementation((payload) => JSON.parse(payload.toString()));
});

describe('Stripe — checkout session creation', () => {
  it('Owner can create a checkout session for an invoice with an outstanding balance', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const practiceId = await getPracticeId();
    const invoice = await createInvoice(ownerToken, practiceId, 150);

    stripeClient.checkout.sessions.create.mockResolvedValueOnce({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/test/cs_test_123',
      customer: 'cus_test_123',
    });

    const res = await request(app)
      .post(`/api/billing/invoices/${invoice.id}/checkout-session`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send();

    expect(res.status).toBe(201);
    expect(res.body.checkoutSession.url).toBe('https://checkout.stripe.com/test/cs_test_123');
    expect(stripeClient.checkout.sessions.create).toHaveBeenCalledTimes(1);
    const callArgs = stripeClient.checkout.sessions.create.mock.calls[0][0];
    // The amount must come from the invoice itself, never a client-supplied value.
    expect(callArgs.line_items[0].price_data.unit_amount).toBe(15000);
    expect(callArgs.metadata.invoiceId).toBe(String(invoice.id));
  });

  it('the seeded dentist_client (can_view_invoices=true) can create a checkout session for their own practice invoice', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const dentistToken = await loginAs('dentist@brightsmile.test');
    const practiceId = await getPracticeId();
    const invoice = await createInvoice(ownerToken, practiceId, 90);

    stripeClient.checkout.sessions.create.mockResolvedValueOnce({
      id: 'cs_test_456',
      url: 'https://checkout.stripe.com/test/cs_test_456',
      customer: null,
    });

    const res = await request(app)
      .post(`/api/billing/invoices/${invoice.id}/checkout-session`)
      .set('Authorization', `Bearer ${dentistToken}`)
      .send();

    expect(res.status).toBe(201);
  });

  it('a Technician (non-billing role) is blocked from creating a checkout session', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const techToken = await loginAs('tech1@dentallab.test');
    const practiceId = await getPracticeId();
    const invoice = await createInvoice(ownerToken, practiceId, 90);

    const res = await request(app)
      .post(`/api/billing/invoices/${invoice.id}/checkout-session`)
      .set('Authorization', `Bearer ${techToken}`)
      .send();

    expect(res.status).toBe(403);
    expect(stripeClient.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('rejects checkout-session creation for an invoice with no outstanding balance', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const practiceId = await getPracticeId();
    const invoice = await createInvoice(ownerToken, practiceId, 60);

    const payRes = await request(app)
      .post(`/api/billing/invoices/${invoice.id}/payments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amount: 60, method: 'Cash' });
    expect(payRes.status).toBe(201);
    expect(payRes.body.invoice.status).toBe('Paid');

    const res = await request(app)
      .post(`/api/billing/invoices/${invoice.id}/checkout-session`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send();

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no outstanding balance/i);
    expect(stripeClient.checkout.sessions.create).not.toHaveBeenCalled();
  });
});

describe('Stripe — webhook handling', () => {
  it('rejects a webhook with an invalid signature', async () => {
    stripeClient.webhooks.constructEvent.mockImplementationOnce(() => {
      throw new Error('signature mismatch');
    });

    const res = await request(app)
      .post('/api/webhooks/stripe')
      .set('stripe-signature', 'bad_sig')
      .send({ id: 'evt_bad', type: 'checkout.session.completed', data: { object: {} } });

    expect(res.status).toBe(400);
  });

  it('records a payment and advances invoice status on checkout.session.completed', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const practiceId = await getPracticeId();
    const invoice = await createInvoice(ownerToken, practiceId, 200);

    const paymentIntentId = `pi_test_${Date.now()}`;
    const event = mockEvent('checkout.session.completed', {
      id: `cs_test_${Date.now()}`,
      payment_intent: paymentIntentId,
      amount_total: 20000,
      metadata: { invoiceId: String(invoice.id) },
    });

    const res = await request(app).post('/api/webhooks/stripe').set('stripe-signature', 'test_sig').send(event);
    expect(res.status).toBe(200);

    const { rows } = await query(
      `SELECT amount, method, stripe_payment_intent_id FROM payments WHERE stripe_payment_intent_id = $1`,
      [paymentIntentId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].method).toBe('Stripe');
    expect(Number(rows[0].amount)).toBe(200);

    const { rows: invoiceRows } = await query('SELECT status, amount_paid FROM invoices WHERE id = $1', [invoice.id]);
    expect(invoiceRows[0].status).toBe('Paid');
  });

  it('is idempotent against Stripe redelivering the same event twice', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const practiceId = await getPracticeId();
    const invoice = await createInvoice(ownerToken, practiceId, 75);

    const paymentIntentId = `pi_test_replay_${Date.now()}`;
    const event = mockEvent('checkout.session.completed', {
      id: `cs_test_replay_${Date.now()}`,
      payment_intent: paymentIntentId,
      amount_total: 7500,
      metadata: { invoiceId: String(invoice.id) },
    });

    const first = await request(app).post('/api/webhooks/stripe').set('stripe-signature', 'test_sig').send(event);
    expect(first.status).toBe(200);

    const second = await request(app).post('/api/webhooks/stripe').set('stripe-signature', 'test_sig').send(event);
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);

    const { rows } = await query('SELECT id FROM payments WHERE stripe_payment_intent_id = $1', [paymentIntentId]);
    expect(rows).toHaveLength(1);
  });

  it('acknowledges but skips irrelevant event types without erroring', async () => {
    const event = mockEvent('customer.created', { id: 'cus_test_irrelevant' });
    const res = await request(app).post('/api/webhooks/stripe').set('stripe-signature', 'test_sig').send(event);
    expect(res.status).toBe(200);
  });
});
