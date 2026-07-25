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

// Same forward-walk pattern as tests/approvals.integration.test.js.
async function createCaseAt(ownerToken, targetStatus) {
  const caseId = await createCase(ownerToken);
  const path = ['In Design', 'Pending Design Approval', 'Processing', 'Pending Bisque Approval', 'Finalizing', 'Shipped Out', 'Delivered'];
  for (const status of path) {
    await request(app)
      .patch(`/api/cases/${caseId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ newStatus: status });
    if (status === targetStatus) break;
  }
  return caseId;
}

beforeEach(() => {
  jest.spyOn(notifications, 'notify');
});
afterEach(() => {
  notifications.notify.mockRestore();
});

describe('POST /api/cases/:id/warranty-claims', () => {
  it('can be filed by staff against a Delivered case', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const caseId = await createCaseAt(ownerToken, 'Delivered');

    const res = await request(app)
      .post(`/api/cases/${caseId}/warranty-claims`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ description: 'Crown cracked after two weeks.' });

    expect(res.status).toBe(201);
    expect(res.body.warrantyClaim.status).toBe('Open');
  });

  it('can be filed by the dentist_client that owns the case', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const caseId = await createCaseAt(ownerToken, 'Delivered');
    const dentistToken = await loginAs('dentist@brightsmile.test');

    const res = await request(app)
      .post(`/api/cases/${caseId}/warranty-claims`)
      .set('Authorization', `Bearer ${dentistToken}`)
      .send({ description: 'Patient reports discomfort.' });

    expect(res.status).toBe(201);
  });

  it('rejects filing against a non-Delivered case with 409', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const caseId = await createCaseAt(ownerToken, 'In Design');

    const res = await request(app)
      .post(`/api/cases/${caseId}/warranty-claims`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ description: 'Too early.' });

    expect(res.status).toBe(409);
  });

  it('returns 403 (not a 404 leak) for a dentist_client on a cross-tenant case', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const managerToken = await loginAs('manager@dentallab.test');
    const otherPracticeRes = await request(app)
      .post('/api/practices')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ practiceName: `Warranty Isolation Office ${Date.now()}` });
    const otherDentistRes = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        fullName: 'Other Dentist',
        email: `warrantydentist_${Date.now()}@x.test`,
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
      .post(`/api/cases/${caseRes.body.case.id}/warranty-claims`)
      .set('Authorization', `Bearer ${dentistToken}`)
      .send({ description: 'Should be blocked.' });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/fulfillment/warranty-claims/:id/resolve', () => {
  it('moving to Under Review leaves resolved_at null', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const caseId = await createCaseAt(ownerToken, 'Delivered');
    const claimRes = await request(app)
      .post(`/api/cases/${caseId}/warranty-claims`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ description: 'Investigating.' });

    const res = await request(app)
      .patch(`/api/fulfillment/warranty-claims/${claimRes.body.warrantyClaim.id}/resolve`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'Under Review' });

    expect(res.status).toBe(200);
    expect(res.body.warrantyClaim.status).toBe('Under Review');
    expect(res.body.warrantyClaim.resolved_at).toBeNull();
  });

  it('moving to Resolved sets resolved_at/resolved_by and notifies the filer', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const caseId = await createCaseAt(ownerToken, 'Delivered');
    const claimRes = await request(app)
      .post(`/api/cases/${caseId}/warranty-claims`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ description: 'Will be resolved.' });

    const res = await request(app)
      .patch(`/api/fulfillment/warranty-claims/${claimRes.body.warrantyClaim.id}/resolve`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'Resolved', resolutionNotes: 'Remade at no charge.' });

    expect(res.status).toBe(200);
    expect(res.body.warrantyClaim.status).toBe('Resolved');
    expect(res.body.warrantyClaim.resolved_at).toBeTruthy();
    expect(res.body.warrantyClaim.resolution_notes).toBe('Remade at no charge.');
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'warranty_claim_updated' })
    );
  });

  it('rejects re-resolving an already-resolved claim with 409', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const caseId = await createCaseAt(ownerToken, 'Delivered');
    const claimRes = await request(app)
      .post(`/api/cases/${caseId}/warranty-claims`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ description: 'x' });
    const claimId = claimRes.body.warrantyClaim.id;

    await request(app)
      .patch(`/api/fulfillment/warranty-claims/${claimId}/resolve`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'Denied' });

    const res = await request(app)
      .patch(`/api/fulfillment/warranty-claims/${claimId}/resolve`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'Resolved' });

    expect(res.status).toBe(409);
  });

  it('blocks a dentist_client from resolving a claim', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const caseId = await createCaseAt(ownerToken, 'Delivered');
    const claimRes = await request(app)
      .post(`/api/cases/${caseId}/warranty-claims`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ description: 'x' });
    const dentistToken = await loginAs('dentist@brightsmile.test');

    const res = await request(app)
      .patch(`/api/fulfillment/warranty-claims/${claimRes.body.warrantyClaim.id}/resolve`)
      .set('Authorization', `Bearer ${dentistToken}`)
      .send({ status: 'Approved' });
    expect(res.status).toBe(403);
  });
});
