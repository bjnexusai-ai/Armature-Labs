/**
 * Integration tests against a real Postgres instance (DATABASE_URL from .env).
 * Assumes migrations + seed have already been run. Run with: npm test
 */
const request = require('supertest');
const app = require('../src/app');
const { query } = require('../src/config/db');

const PASSWORD = 'TestPass123!';

async function loginAs(email) {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.accessToken;
}

async function getIds() {
  const practice = await query("SELECT id FROM practices WHERE practice_name = 'Bright Smile Dental Clinic'");
  const crown = await query("SELECT id FROM case_types WHERE name = 'Crown'");
  const bridge = await query("SELECT id FROM case_types WHERE name = 'Bridge'");
  return { practiceId: practice.rows[0].id, crownTypeId: crown.rows[0].id, bridgeTypeId: bridge.rows[0].id };
}

describe('Billing — fee schedules', () => {
  it('Owner can create a fee schedule with items', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const { crownTypeId, bridgeTypeId } = await getIds();

    const res = await request(app)
      .post('/api/billing/fee-schedules')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: `Standard Rates ${Date.now()}`,
        items: [
          { caseTypeId: crownTypeId, unitPrice: 250 },
          { caseTypeId: bridgeTypeId, unitPrice: 400 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.feeSchedule.items).toHaveLength(2);
  });

  it('a Technician (non-billing role) is blocked from creating a fee schedule', async () => {
    const techToken = await loginAs('tech1@dentallab.test');
    const res = await request(app)
      .post('/api/billing/fee-schedules')
      .set('Authorization', `Bearer ${techToken}`)
      .send({ name: 'Blocked Attempt', items: [] });
    expect(res.status).toBe(403);
  });

  it('Office Manager can assign a fee schedule to a practice', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const managerToken = await loginAs('manager@dentallab.test');
    const { practiceId, crownTypeId } = await getIds();

    const scheduleRes = await request(app)
      .post('/api/billing/fee-schedules')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Assign Test ${Date.now()}`, items: [{ caseTypeId: crownTypeId, unitPrice: 300 }] });
    const scheduleId = scheduleRes.body.feeSchedule.id;

    const assignRes = await request(app)
      .put(`/api/practices/${practiceId}/fee-schedule`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ feeScheduleId: scheduleId });

    expect(assignRes.status).toBe(200);
    expect(String(assignRes.body.practiceFeeSchedule.fee_schedule_id)).toBe(String(scheduleId));
  });
});

describe('Billing — invoices and payments', () => {
  it('creates an invoice with line items, subtotal computed server-side', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const { practiceId } = await getIds();

    const res = await request(app)
      .post('/api/billing/invoices')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        practiceId,
        lineItems: [
          { description: 'Crown — CASE test', quantity: 2, unitPrice: 250 },
          { description: 'Shipping', quantity: 1, unitPrice: 15 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.invoice.subtotal).toBe('515.00');
    expect(res.body.invoice.invoice_number).toMatch(/^INV-\d{4}-\d{4}$/);
    expect(res.body.invoice.status).toBe('Sent');
  });

  it('the seeded dentist_client (can_view_invoices=true) can list invoices for their own practice', async () => {
    const dentistToken = await loginAs('dentist@brightsmile.test');
    const res = await request(app).get('/api/billing/invoices').set('Authorization', `Bearer ${dentistToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.invoices)).toBe(true);
  });

  it('a Designer (internal, non-billing role) is blocked from listing invoices', async () => {
    const designerToken = await loginAs('designer@dentallab.test');
    const res = await request(app).get('/api/billing/invoices').set('Authorization', `Bearer ${designerToken}`);
    expect(res.status).toBe(403);
  });

  it('recording payments accumulates amount_paid and auto-marks Paid once subtotal is met', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const { practiceId } = await getIds();

    const invoiceRes = await request(app)
      .post('/api/billing/invoices')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ practiceId, lineItems: [{ description: 'Bridge', quantity: 1, unitPrice: 100 }] });
    const invoiceId = invoiceRes.body.invoice.id;

    const partialRes = await request(app)
      .post(`/api/billing/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amount: 40, method: 'Check' });
    expect(partialRes.status).toBe(201);
    expect(partialRes.body.invoice.status).toBe('Partially Paid');
    expect(partialRes.body.invoice.amount_paid).toBe('40.00');

    const finalRes = await request(app)
      .post(`/api/billing/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amount: 60, method: 'Bank Transfer' });
    expect(finalRes.status).toBe(201);
    expect(finalRes.body.invoice.status).toBe('Paid');
    expect(finalRes.body.invoice.amount_paid).toBe('100.00');
  });

  it('rejects a payment against a Void invoice', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const { practiceId } = await getIds();

    const invoiceRes = await request(app)
      .post('/api/billing/invoices')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ practiceId, lineItems: [{ description: 'Void test', quantity: 1, unitPrice: 50 }] });
    const invoiceId = invoiceRes.body.invoice.id;

    await query("UPDATE invoices SET status = 'Void' WHERE id = $1", [invoiceId]);

    const payRes = await request(app)
      .post(`/api/billing/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amount: 10, method: 'Cash' });
    expect(payRes.status).toBe(409);
  });
});

// Session 5.5 backend fix — due_date/tax_amount/paid_date wiring. Migration
// 0024 added these columns; this closes the gap where nothing selected or
// accepted them (see SESSION_5_5_BACKEND_FIX_PROMPT.md).
describe('Billing — invoice due date, tax amount, paid date (Session 5.5 fix)', () => {
  it('accepts optional dueDate/taxAmount on create and returns null paid_date until paid', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const { practiceId } = await getIds();

    const res = await request(app)
      .post('/api/billing/invoices')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        practiceId,
        dueDate: '2026-09-01',
        taxAmount: 12.5,
        lineItems: [{ description: 'Crown', quantity: 1, unitPrice: 200 }],
      });

    expect(res.status).toBe(201);
    // `date` columns come back from pg/Express as full ISO datetime strings
    // (e.g. "2026-09-01T00:00:00.000Z"), same as cases.due_date already
    // does — this is exactly the ambiguity parseFlexibleDate() on the
    // frontend was built to absorb, not a regression introduced here.
    expect(res.body.invoice.due_date).toMatch(/^2026-09-01T00:00:00/);
    expect(res.body.invoice.tax_amount).toBe('12.50');
    expect(res.body.invoice.paid_date).toBeNull();
  });

  it('defaults tax_amount to 0.00 and due_date to null when omitted', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const { practiceId } = await getIds();

    const res = await request(app)
      .post('/api/billing/invoices')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ practiceId, lineItems: [{ description: 'Bridge', quantity: 1, unitPrice: 80 }] });

    expect(res.status).toBe(201);
    expect(res.body.invoice.due_date).toBeNull();
    expect(res.body.invoice.tax_amount).toBe('0.00');
  });

  it('rejects a client-supplied paidDate on create (server-set only)', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const { practiceId } = await getIds();

    const res = await request(app)
      .post('/api/billing/invoices')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        practiceId,
        paidDate: '2026-01-01',
        lineItems: [{ description: 'Bridge', quantity: 1, unitPrice: 80 }],
      });

    expect(res.status).toBe(400);
  });

  it('sets paid_date only on the transition into Paid, and GET reflects it', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const { practiceId } = await getIds();

    const invoiceRes = await request(app)
      .post('/api/billing/invoices')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ practiceId, lineItems: [{ description: 'Bridge', quantity: 1, unitPrice: 100 }] });
    const invoiceId = invoiceRes.body.invoice.id;
    expect(invoiceRes.body.invoice.paid_date).toBeNull();

    const partialRes = await request(app)
      .post(`/api/billing/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amount: 40, method: 'Check' });
    expect(partialRes.body.invoice.paid_date).toBeNull();

    const finalRes = await request(app)
      .post(`/api/billing/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amount: 60, method: 'Bank Transfer' });
    expect(finalRes.body.invoice.status).toBe('Paid');
    expect(finalRes.body.invoice.paid_date).not.toBeNull();

    const firstPaidDate = finalRes.body.invoice.paid_date;

    // An additional (over)payment applied after Paid must not overwrite the
    // original paid_date.
    const extraRes = await request(app)
      .post(`/api/billing/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amount: 5, method: 'Check' });
    expect(extraRes.body.invoice.paid_date).toBe(firstPaidDate);

    const getRes = await request(app)
      .get(`/api/billing/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.invoice.paid_date).toBe(firstPaidDate);
    expect(getRes.body.invoice.due_date).toBeNull();
    expect(getRes.body.invoice.tax_amount).toBe('0.00');
  });

  it('list endpoints include due_date/tax_amount/paid_date for both internal and portal users', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const dentistToken = await loginAs('dentist@brightsmile.test');

    const internalRes = await request(app).get('/api/billing/invoices').set('Authorization', `Bearer ${ownerToken}`);
    expect(internalRes.status).toBe(200);
    expect(internalRes.body.invoices[0]).toHaveProperty('due_date');
    expect(internalRes.body.invoices[0]).toHaveProperty('tax_amount');
    expect(internalRes.body.invoices[0]).toHaveProperty('paid_date');

    const portalRes = await request(app).get('/api/billing/invoices').set('Authorization', `Bearer ${dentistToken}`);
    expect(portalRes.status).toBe(200);
    if (portalRes.body.invoices.length) {
      expect(portalRes.body.invoices[0]).toHaveProperty('due_date');
      expect(portalRes.body.invoices[0]).toHaveProperty('tax_amount');
      expect(portalRes.body.invoices[0]).toHaveProperty('paid_date');
    }
  });
});
