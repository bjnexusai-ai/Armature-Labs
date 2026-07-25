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
