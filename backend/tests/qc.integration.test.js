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

async function createCase(ownerToken) {
  const { practiceId, dentistId, caseTypeId } = await getIds();
  const res = await request(app)
    .post('/api/cases')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ practiceId, dentistId, caseTypeId, dueDate: futureDueDate() });
  return res.body.case.id;
}

async function createChecklist(ownerToken) {
  const res = await request(app)
    .post('/api/qc/checklists')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: `QC Checklist ${Date.now()}`, items: ['Margins fit', 'Shade matches Rx', 'No visible defects'] });
  return res.body.checklist;
}

describe('QC — checklist templates', () => {
  it('Owner can create a checklist with items', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const checklist = await createChecklist(ownerToken);
    expect(checklist.items).toHaveLength(3);
  });

  it('a dentist_client is blocked from creating a checklist (lab-staff only)', async () => {
    const dentistToken = await loginAs('dentist@brightsmile.test');
    const res = await request(app)
      .post('/api/qc/checklists')
      .set('Authorization', `Bearer ${dentistToken}`)
      .send({ name: 'Blocked', items: ['x'] });
    expect(res.status).toBe(403);
  });
});

describe('QC — case results', () => {
  it('records a QC result and derives overall_status=Pass when all items pass', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const caseId = await createCase(ownerToken);
    const checklist = await createChecklist(ownerToken);

    const res = await request(app)
      .post(`/api/cases/${caseId}/qc-results`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        qcChecklistId: checklist.id,
        itemResults: checklist.items.map((i) => ({ itemId: i.id, passed: true })),
      });

    expect(res.status).toBe(201);
    expect(res.body.qcResult.overall_status).toBe('Pass');
  });

  it('derives overall_status=Fail when any item fails', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const caseId = await createCase(ownerToken);
    const checklist = await createChecklist(ownerToken);

    const itemResults = checklist.items.map((i, idx) => ({ itemId: i.id, passed: idx !== 0 }));
    const res = await request(app)
      .post(`/api/cases/${caseId}/qc-results`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ qcChecklistId: checklist.id, itemResults });

    expect(res.status).toBe(201);
    expect(res.body.qcResult.overall_status).toBe('Fail');
  });
});

describe('QC — rework (tracked independently of the case state machine)', () => {
  it('opens and resolves a rework record without touching cases.current_status', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const caseId = await createCase(ownerToken);

    const beforeStatus = await query('SELECT current_status FROM cases WHERE id = $1', [caseId]);

    const openRes = await request(app)
      .post(`/api/cases/${caseId}/rework`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ reason: 'Margin gap found on inspection.' });
    expect(openRes.status).toBe(201);
    expect(openRes.body.rework.resolved_at).toBeNull();

    const afterOpenStatus = await query('SELECT current_status FROM cases WHERE id = $1', [caseId]);
    expect(afterOpenStatus.rows[0].current_status).toBe(beforeStatus.rows[0].current_status);

    const resolveRes = await request(app)
      .patch(`/api/qc/rework/${openRes.body.rework.id}/resolve`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ resolutionNotes: 'Remade and refit.' });
    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.rework.resolved_at).not.toBeNull();
  });

  it('rejects resolving an already-resolved rework record', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const caseId = await createCase(ownerToken);

    const openRes = await request(app)
      .post(`/api/cases/${caseId}/rework`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ reason: 'Shade mismatch.' });

    await request(app)
      .patch(`/api/qc/rework/${openRes.body.rework.id}/resolve`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});

    const secondResolve = await request(app)
      .patch(`/api/qc/rework/${openRes.body.rework.id}/resolve`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});
    expect(secondResolve.status).toBe(409);
  });
});

describe('QC — final approval', () => {
  it('requires a Pass QC result and allows only one final approval per case', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const caseId = await createCase(ownerToken);
    const checklist = await createChecklist(ownerToken);

    const failRes = await request(app)
      .post(`/api/cases/${caseId}/qc-results`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        qcChecklistId: checklist.id,
        itemResults: checklist.items.map((i, idx) => ({ itemId: i.id, passed: idx !== 0 })),
      });

    const blockedApproval = await request(app)
      .post(`/api/cases/${caseId}/final-approval`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ caseQcResultId: failRes.body.qcResult.id });
    expect(blockedApproval.status).toBe(409);

    const passRes = await request(app)
      .post(`/api/cases/${caseId}/qc-results`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        qcChecklistId: checklist.id,
        itemResults: checklist.items.map((i) => ({ itemId: i.id, passed: true })),
      });

    const approvalRes = await request(app)
      .post(`/api/cases/${caseId}/final-approval`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ caseQcResultId: passRes.body.qcResult.id });
    expect(approvalRes.status).toBe(201);

    const secondApprovalRes = await request(app)
      .post(`/api/cases/${caseId}/final-approval`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ caseQcResultId: passRes.body.qcResult.id });
    expect(secondApprovalRes.status).toBe(409);
  });
});
