/**
 * Integration tests against a real Postgres instance (DATABASE_URL from .env).
 * Assumes migrations + seed have already been run. Run with: npm test
 */
const request = require('supertest');
const app = require('../src/app');
const { query } = require('../src/config/db');
const notifications = require('../src/services/notifications');

const PASSWORD = 'TestPass123!';

async function loginAs(email) {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.accessToken;
}

async function getIds() {
  const practice = await query("SELECT id FROM practices WHERE practice_name = 'Bright Smile Dental Clinic'");
  const dentist = await query("SELECT id FROM users WHERE email = 'dentist@brightsmile.test'");
  const caseType = await query("SELECT id FROM case_types WHERE name = 'Crown'");
  return {
    practiceId: practice.rows[0].id,
    dentistId: dentist.rows[0].id,
    caseTypeId: caseType.rows[0].id,
  };
}

function futureDueDate(daysOut = 10) {
  const d = new Date();
  d.setDate(d.getDate() + daysOut);
  return d.toISOString().slice(0, 10);
}

async function createCase(ownerToken) {
  const { practiceId, dentistId, caseTypeId } = await getIds();
  const res = await request(app)
    .post('/api/cases')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ practiceId, dentistId, caseTypeId, dueDate: futureDueDate() });
  return res.body.case.id;
}

async function createShipment(ownerToken, caseId, overrides = {}) {
  return request(app)
    .post(`/api/cases/${caseId}/shipments`)
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ carrier: 'FedEx', trackingNumber: 'TRACK123', ...overrides });
}

beforeEach(() => {
  jest.spyOn(notifications, 'notify');
});
afterEach(() => {
  notifications.notify.mockRestore();
});

describe('POST /api/cases/:id/shipments', () => {
  it('staff can create a shipment, defaulting to status Preparing', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const caseId = await createCase(ownerToken);

    const res = await createShipment(ownerToken, caseId);
    expect(res.status).toBe(201);
    expect(res.body.shipment.status).toBe('Preparing');
    expect(res.body.shipment.carrier).toBe('FedEx');
  });

  it('blocks a dentist_client from creating a shipment', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const caseId = await createCase(ownerToken);
    const dentistToken = await loginAs('dentist@brightsmile.test');

    const res = await request(app)
      .post(`/api/cases/${caseId}/shipments`)
      .set('Authorization', `Bearer ${dentistToken}`)
      .send({ carrier: 'FedEx' });
    expect(res.status).toBe(403);
  });

  it('returns 404 for a nonexistent case', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const res = await request(app)
      .post('/api/cases/99999999/shipments')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});
    expect(res.status).toBe(404);
  });
});

describe('GET /api/cases/:id/shipments', () => {
  it('a tenant-scoped dentist_client can read shipments on their own case', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const caseId = await createCase(ownerToken);
    await createShipment(ownerToken, caseId);

    const dentistToken = await loginAs('dentist@brightsmile.test');
    const res = await request(app)
      .get(`/api/cases/${caseId}/shipments`)
      .set('Authorization', `Bearer ${dentistToken}`);
    expect(res.status).toBe(200);
    expect(res.body.shipments).toHaveLength(1);
  });

  it('returns 403 (not a 404 leak) for a dentist_client on a cross-tenant case', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const managerToken = await loginAs('manager@dentallab.test');
    const otherPracticeRes = await request(app)
      .post('/api/practices')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ practiceName: `Shipments Isolation Office ${Date.now()}` });
    const otherDentistRes = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        fullName: 'Other Dentist',
        email: `shipdentist_${Date.now()}@x.test`,
        password: PASSWORD,
        role: 'dentist_client',
        practiceId: Number(otherPracticeRes.body.practice.id),
      });
    const { caseTypeId } = await getIds();
    const caseRes = await request(app)
      .post('/api/cases')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        practiceId: otherPracticeRes.body.practice.id,
        dentistId: otherDentistRes.body.user.id,
        caseTypeId,
        dueDate: futureDueDate(),
      });

    const dentistToken = await loginAs('dentist@brightsmile.test');
    const res = await request(app)
      .get(`/api/cases/${caseRes.body.case.id}/shipments`)
      .set('Authorization', `Bearer ${dentistToken}`);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/fulfillment/shipments/:id/status', () => {
  it('staff can advance a shipment to Shipped, setting shipped_at and notifying the dental office', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const caseId = await createCase(ownerToken);
    const shipmentRes = await createShipment(ownerToken, caseId);

    const res = await request(app)
      .patch(`/api/fulfillment/shipments/${shipmentRes.body.shipment.id}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'Shipped' });

    expect(res.status).toBe(200);
    expect(res.body.shipment.status).toBe('Shipped');
    expect(res.body.shipment.shipped_at).toBeTruthy();
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'case_shipped_out' })
    );
  });

  it('staff can advance a shipment to Delivered, setting delivered_at and notifying the dental office', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const caseId = await createCase(ownerToken);
    const shipmentRes = await createShipment(ownerToken, caseId);

    const res = await request(app)
      .patch(`/api/fulfillment/shipments/${shipmentRes.body.shipment.id}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'Delivered' });

    expect(res.status).toBe(200);
    expect(res.body.shipment.status).toBe('Delivered');
    expect(res.body.shipment.delivered_at).toBeTruthy();
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'case_delivered' })
    );
  });

  it('blocks a dentist_client from updating shipment status', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const caseId = await createCase(ownerToken);
    const shipmentRes = await createShipment(ownerToken, caseId);
    const dentistToken = await loginAs('dentist@brightsmile.test');

    const res = await request(app)
      .patch(`/api/fulfillment/shipments/${shipmentRes.body.shipment.id}/status`)
      .set('Authorization', `Bearer ${dentistToken}`)
      .send({ status: 'Shipped' });
    expect(res.status).toBe(403);
  });

  it('returns 404 for a nonexistent shipment', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const res = await request(app)
      .patch('/api/fulfillment/shipments/99999999/status')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'Shipped' });
    expect(res.status).toBe(404);
  });
});
