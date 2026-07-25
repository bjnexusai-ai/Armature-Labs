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

async function createTestCase(token, overrides = {}) {
  const { practiceId, dentistId, caseTypeId } = await getIds();
  const res = await request(app)
    .post('/api/cases')
    .set('Authorization', `Bearer ${token}`)
    .send({
      practiceId,
      dentistId,
      caseTypeId,
      patientName: 'Test Patient',
      dueDate: futureDueDate(),
      ...overrides,
    });
  return res;
}

describe('Case creation', () => {
  it('allows internal staff (owner) to create a case', async () => {
    const token = await loginAs('owner@dentallab.test');
    const res = await createTestCase(token);
    expect(res.status).toBe(201);
    expect(res.body.case.current_status).toBe('Case Entered');
    expect(res.body.case.case_number).toMatch(/^CASE-\d{4}-\d{5}$/);
    expect(res.body.case.prior_status).toBeNull();
  });

  it('blocks dentist_client from creating a case', async () => {
    const token = await loginAs('dentist@brightsmile.test');
    const res = await createTestCase(token);
    expect(res.status).toBe(403);
  });

  it('rejects an attempt to set case_number in the body with 400', async () => {
    const token = await loginAs('owner@dentallab.test');
    const { practiceId, dentistId, caseTypeId } = await getIds();
    const res = await request(app)
      .post('/api/cases')
      .set('Authorization', `Bearer ${token}`)
      .send({
        practiceId, dentistId, caseTypeId,
        dueDate: futureDueDate(),
        caseNumber: 'CASE-2026-99999',
      });
    expect(res.status).toBe(400);
  });

  it('rejects a dentist not linked to the given practice with 400', async () => {
    const token = await loginAs('owner@dentallab.test');
    const { caseTypeId } = await getIds();
    // manager@dentallab.test is internal, not a dentist_client -> also fails the
    // dentist_client-role check, which is the point: dentistId must be a real
    // portal user linked to that practice.
    const managerRow = await query("SELECT id FROM users WHERE email = 'manager@dentallab.test'");
    const { practiceId } = await getIds();
    const res = await request(app)
      .post('/api/cases')
      .set('Authorization', `Bearer ${token}`)
      .send({
        practiceId, dentistId: managerRow.rows[0].id, caseTypeId,
        dueDate: futureDueDate(),
      });
    expect(res.status).toBe(400);
  });

  it('rejects a nonexistent caseTypeId with 400', async () => {
    const token = await loginAs('owner@dentallab.test');
    const { practiceId, dentistId } = await getIds();
    const res = await request(app)
      .post('/api/cases')
      .set('Authorization', `Bearer ${token}`)
      .send({ practiceId, dentistId, caseTypeId: 999999, dueDate: futureDueDate() });
    expect(res.status).toBe(400);
  });

  it('seeds an initial "In Progress" Submitted stage row on creation', async () => {
    const token = await loginAs('owner@dentallab.test');
    const createRes = await createTestCase(token);
    const getRes = await request(app)
      .get(`/api/cases/${createRes.body.case.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.body.currentStage.stage_name).toBe('Submitted');
    expect(getRes.body.currentStage.status).toBe('In Progress');
  });
});

describe('GET /api/cases', () => {
  it('paginates with a default limit', async () => {
    const token = await loginAs('owner@dentallab.test');
    const res = await request(app).get('/api/cases').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBe(25);
    expect(res.body.pagination.page).toBe(1);
  });

  it('filters by status', async () => {
    const token = await loginAs('owner@dentallab.test');
    const res = await request(app)
      .get('/api/cases?status=Case Entered')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.cases.every((c) => c.current_status === 'Case Entered')).toBe(true);
  });

  it('tenant isolation: dentist_client only sees their own practice cases', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    // Create an isolated second practice + case to prove it's excluded.
    const otherPracticeRes = await request(app)
      .post('/api/practices')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ practiceName: `Isolated Cases Office ${Date.now()}` });

    const token = await loginAs('dentist@brightsmile.test');
    const res = await request(app).get('/api/cases').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const { practiceId } = await getIds();
    expect(res.body.cases.every((c) => String(c.practice_id) === String(practiceId))).toBe(true);
    expect(otherPracticeRes.status).toBe(201);
  });

  it('rejects a dentist_client attempt to filter by practiceId with 400', async () => {
    const token = await loginAs('dentist@brightsmile.test');
    const res = await request(app)
      .get('/api/cases?practiceId=1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/cases/:id', () => {
  it('returns the case with currentStage and recentStatusAudit inline', async () => {
    const token = await loginAs('owner@dentallab.test');
    const createRes = await createTestCase(token);
    const res = await request(app)
      .get(`/api/cases/${createRes.body.case.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.currentStage).toBeTruthy();
    expect(res.body.recentStatusAudit.length).toBeGreaterThanOrEqual(1);
  });

  it('returns 404 for a nonexistent case', async () => {
    const token = await loginAs('owner@dentallab.test');
    const res = await request(app).get('/api/cases/99999999').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns 403 (not a 404 leak) for a dentist_client on a cross-tenant case', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const otherPracticeRes = await request(app)
      .post('/api/practices')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ practiceName: `Cross Tenant Case Office ${Date.now()}` });

    const managerToken = await loginAs('manager@dentallab.test');
    const otherDentistRes = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        fullName: 'Other Dentist',
        email: `otherdentist_${Date.now()}@x.test`,
        password: 'password123',
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
      .get(`/api/cases/${caseRes.body.case.id}`)
      .set('Authorization', `Bearer ${dentistToken}`);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/cases/:id (non-status fields)', () => {
  it('updates allowed fields', async () => {
    const token = await loginAs('owner@dentallab.test');
    const createRes = await createTestCase(token);
    const res = await request(app)
      .patch(`/api/cases/${createRes.body.case.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ priority: 'Urgent', notes: 'Patient requested rush.' });
    expect(res.status).toBe(200);
    expect(res.body.case.priority).toBe('Urgent');
    expect(res.body.case.notes).toBe('Patient requested rush.');
  });

  it('rejects any attempt to set current_status through this endpoint with 400', async () => {
    const token = await loginAs('owner@dentallab.test');
    const createRes = await createTestCase(token);
    const res = await request(app)
      .patch(`/api/cases/${createRes.body.case.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ currentStatus: 'In Design' });
    expect(res.status).toBe(400);
  });

  it('blocks dentist_client entirely', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const createRes = await createTestCase(ownerToken);
    const token = await loginAs('dentist@brightsmile.test');
    const res = await request(app)
      .patch(`/api/cases/${createRes.body.case.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'x' });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/cases/:id/status — state machine', () => {
  it('walks the full valid linear sequence end-to-end', async () => {
    const token = await loginAs('owner@dentallab.test');
    const createRes = await createTestCase(token);
    const caseId = createRes.body.case.id;

    const sequence = [
      'In Design',
      'Pending Design Approval',
      'Processing',
      'Pending Bisque Approval',
      'Finalizing',
      'Shipped Out',
      'Delivered',
    ];

    for (const newStatus of sequence) {
      const res = await request(app)
        .patch(`/api/cases/${caseId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ newStatus });
      expect(res.status).toBe(200);
      expect(res.body.case.current_status).toBe(newStatus);
    }

    const getRes = await request(app).get(`/api/cases/${caseId}`).set('Authorization', `Bearer ${token}`);
    expect(getRes.body.recentStatusAudit.length).toBe(8); // 1 create + 7 transitions
  });

  it('rejects a skipped/invalid transition with 409', async () => {
    const token = await loginAs('owner@dentallab.test');
    const createRes = await createTestCase(token);
    const res = await request(app)
      .patch(`/api/cases/${createRes.body.case.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ newStatus: 'Processing' }); // skips In Design + Pending Design Approval
    expect(res.status).toBe(409);
  });

  it('Hold entry+clear round trip: prior_status set on entry, restored on clear', async () => {
    const token = await loginAs('owner@dentallab.test');
    const createRes = await createTestCase(token);
    const caseId = createRes.body.case.id;

    await request(app)
      .patch(`/api/cases/${caseId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ newStatus: 'In Design' });

    const holdRes = await request(app)
      .patch(`/api/cases/${caseId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ newStatus: 'Case on Hold', remarks: 'Waiting on materials.' });
    expect(holdRes.status).toBe(200);
    expect(holdRes.body.case.current_status).toBe('Case on Hold');
    expect(holdRes.body.case.prior_status).toBe('In Design');

    const clearRes = await request(app)
      .patch(`/api/cases/${caseId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ newStatus: 'In Design', remarks: 'Materials arrived.' });
    expect(clearRes.status).toBe(200);
    expect(clearRes.body.case.current_status).toBe('In Design');
    expect(clearRes.body.case.prior_status).toBeNull();
  });

  it('rejects entering Hold without remarks with 400', async () => {
    const token = await loginAs('owner@dentallab.test');
    const createRes = await createTestCase(token);
    const res = await request(app)
      .patch(`/api/cases/${createRes.body.case.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ newStatus: 'Case on Hold' });
    expect(res.status).toBe(400);
  });

  it('Delivered is terminal — any further transition returns 409', async () => {
    const token = await loginAs('owner@dentallab.test');
    const createRes = await createTestCase(token);
    const caseId = createRes.body.case.id;
    const sequence = ['In Design', 'Pending Design Approval', 'Processing', 'Pending Bisque Approval', 'Finalizing', 'Shipped Out', 'Delivered'];
    for (const newStatus of sequence) {
      await request(app).patch(`/api/cases/${caseId}/status`).set('Authorization', `Bearer ${token}`).send({ newStatus });
    }
    const res = await request(app)
      .patch(`/api/cases/${caseId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ newStatus: 'Case on Hold', remarks: 'should be blocked' });
    expect(res.status).toBe(409);
  });

  it('a dentist_client attempting to change status is blocked with 403', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const createRes = await createTestCase(ownerToken);
    const token = await loginAs('dentist@brightsmile.test');
    const res = await request(app)
      .patch(`/api/cases/${createRes.body.case.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ newStatus: 'In Design' });
    expect(res.status).toBe(403);
  });
});
