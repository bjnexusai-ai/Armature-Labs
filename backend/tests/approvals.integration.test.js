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

async function createCaseAt(ownerToken, targetStatus) {
  const { practiceId, dentistId, caseTypeId } = await getIds();
  const createRes = await request(app)
    .post('/api/cases')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ practiceId, dentistId, caseTypeId, dueDate: futureDueDate() });
  const caseId = createRes.body.case.id;

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

// Grants can_approve_photos to the seeded portal dentist, or creates a fresh
// portal user on a fresh practice when isolation from the seeded one matters.
async function grantApprovalPermission(ownerToken) {
  await query("UPDATE users SET can_approve_photos = true WHERE email = 'dentist@brightsmile.test'");
  return loginAs('dentist@brightsmile.test');
}

async function createIsolatedPracticeWithApprover(ownerToken, managerToken) {
  const practiceRes = await request(app)
    .post('/api/practices')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ practiceName: `Approvals Isolation Office ${Date.now()}` });
  const practiceId = practiceRes.body.practice.id;

  const email = `approver_${Date.now()}@x.test`;
  const userRes = await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${managerToken}`)
    .send({
      fullName: 'Isolated Approver',
      email,
      password: PASSWORD,
      role: 'dentist_client',
      practiceId: Number(practiceId),
      canApprovePhotos: true,
    });

  const token = await loginAs(email);
  return { practiceId: Number(practiceId), dentistId: userRes.body.user.id, token };
}

async function uploadDesignMedia(ownerToken, caseId, overrides = {}) {
  return request(app)
    .post(`/api/cases/${caseId}/media`)
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({
      fileName: 'design_v1.jpg',
      fileType: 'Image',
      mediaStage: 'design',
      fileUrl: 'https://example-storage.test/design_v1.jpg',
      ...overrides,
    });
}

describe('POST /api/cases/:id/media', () => {
  it('design upload creates a pending approval and moves the case to Pending Design Approval', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const caseId = await createCaseAt(ownerToken, 'In Design');

    const res = await uploadDesignMedia(ownerToken, caseId);
    expect(res.status).toBe(201);
    expect(res.body.approval.status).toBe('pending');
    expect(res.body.approval.stage).toBe('design');
    expect(res.body.case.current_status).toBe('Pending Design Approval');
    expect(res.body.file.media_stage).toBe('design');
  });

  it('fires the approval_requested notification with the correct recipients + payload', async () => {
    const spy = jest.spyOn(notifications, 'notify');
    const ownerToken = await loginAs('owner@dentallab.test');
    await grantApprovalPermission(ownerToken);
    const caseId = await createCaseAt(ownerToken, 'In Design');

    const res = await uploadDesignMedia(ownerToken, caseId);

    const { dentistId } = await getIds();
    const call = spy.mock.calls.find((c) => c[0].event === 'approval_requested');
    expect(call).toBeTruthy();
    expect(call[0].recipientUserIds).toContain(dentistId);
    expect(call[0].payload).toMatchObject({ caseId, approvalId: res.body.approval.id, stage: 'design' });
    spy.mockRestore();
  });

  it('blocks dentist_client from uploading', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const caseId = await createCaseAt(ownerToken, 'In Design');
    const dentistToken = await loginAs('dentist@brightsmile.test');

    const res = await request(app)
      .post(`/api/cases/${caseId}/media`)
      .set('Authorization', `Bearer ${dentistToken}`)
      .send({
        fileName: 'x.jpg', fileType: 'Image', mediaStage: 'design', fileUrl: 'https://example-storage.test/x.jpg',
      });
    expect(res.status).toBe(403);
  });

  it('rejects an upload when the case is not at the right predecessor status', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    // Fresh case sits at 'Case Entered', not 'In Design' — design upload
    // would require a Case Entered -> Pending Design Approval jump, invalid.
    const { practiceId, dentistId, caseTypeId } = await getIds();
    const createRes = await request(app)
      .post('/api/cases')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ practiceId, dentistId, caseTypeId, dueDate: futureDueDate() });

    const res = await uploadDesignMedia(ownerToken, createRes.body.case.id);
    expect(res.status).toBe(409);
  });
});

describe('POST /api/approvals/:id/approve', () => {
  it('happy path: advances Pending Design Approval -> Processing', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const dentistToken = await grantApprovalPermission(ownerToken);
    const caseId = await createCaseAt(ownerToken, 'In Design');
    const uploadRes = await uploadDesignMedia(ownerToken, caseId);
    const approvalId = uploadRes.body.approval.id;

    const res = await request(app)
      .post(`/api/approvals/${approvalId}/approve`)
      .set('Authorization', `Bearer ${dentistToken}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.approval.status).toBe('approved');
    expect(res.body.case.current_status).toBe('Processing');
  });

  it('fires the approval_given notification to the assigned staff', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const dentistToken = await grantApprovalPermission(ownerToken);
    const caseId = await createCaseAt(ownerToken, 'In Design');

    const staff = await query("SELECT id FROM users WHERE email = 'tech1@dentallab.test'");
    await query('UPDATE cases SET assigned_staff_id = $1 WHERE id = $2', [staff.rows[0].id, caseId]);

    const uploadRes = await uploadDesignMedia(ownerToken, caseId);
    const spy = jest.spyOn(notifications, 'notify');

    const res = await request(app)
      .post(`/api/approvals/${uploadRes.body.approval.id}/approve`)
      .set('Authorization', `Bearer ${dentistToken}`)
      .send({});
    expect(res.status).toBe(200);

    const call = spy.mock.calls.find((c) => c[0].event === 'approval_given');
    expect(call).toBeTruthy();
    expect(call[0].recipientUserIds).toEqual([staff.rows[0].id]);
    spy.mockRestore();
  });

  it('403s a user without can_approve_photos', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    await query("UPDATE users SET can_approve_photos = false WHERE email = 'dentist@brightsmile.test'");
    const dentistToken = await loginAs('dentist@brightsmile.test');
    const caseId = await createCaseAt(ownerToken, 'In Design');
    const uploadRes = await uploadDesignMedia(ownerToken, caseId);

    const res = await request(app)
      .post(`/api/approvals/${uploadRes.body.approval.id}/approve`)
      .set('Authorization', `Bearer ${dentistToken}`)
      .send({});
    expect(res.status).toBe(403);
  });

  it('409s approving an already-responded approval', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const dentistToken = await grantApprovalPermission(ownerToken);
    const caseId = await createCaseAt(ownerToken, 'In Design');
    const uploadRes = await uploadDesignMedia(ownerToken, caseId);
    const approvalId = uploadRes.body.approval.id;

    await request(app)
      .post(`/api/approvals/${approvalId}/approve`)
      .set('Authorization', `Bearer ${dentistToken}`)
      .send({});

    const res = await request(app)
      .post(`/api/approvals/${approvalId}/approve`)
      .set('Authorization', `Bearer ${dentistToken}`)
      .send({});
    expect(res.status).toBe(409);
  });

  it('403s (not 404) a cross-tenant approval action', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const managerToken = await loginAs('manager@dentallab.test');

    // Practice A's approver, acting on Practice B's approval.
    const practiceB = await createIsolatedPracticeWithApprover(ownerToken, managerToken);
    const dentistTokenA = await grantApprovalPermission(ownerToken); // seeded Bright Smile practice = "A"

    // Create + advance a case belonging to Practice B (the isolated one).
    const { caseTypeId } = await getIds();
    const createRes = await request(app)
      .post('/api/cases')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        practiceId: practiceB.practiceId, dentistId: practiceB.dentistId, caseTypeId, dueDate: futureDueDate(),
      });
    const caseIdB = createRes.body.case.id;
    await request(app).patch(`/api/cases/${caseIdB}/status`).set('Authorization', `Bearer ${ownerToken}`).send({ newStatus: 'In Design' });
    const uploadRes = await uploadDesignMedia(ownerToken, caseIdB);

    const res = await request(app)
      .post(`/api/approvals/${uploadRes.body.approval.id}/approve`)
      .set('Authorization', `Bearer ${dentistTokenA}`)
      .send({});
    expect(res.status).toBe(403);
  });
});

describe('POST /api/approvals/:id/request-changes', () => {
  it('happy path: reverts Pending Design Approval -> In Design and records comments', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const dentistToken = await grantApprovalPermission(ownerToken);
    const caseId = await createCaseAt(ownerToken, 'In Design');
    const uploadRes = await uploadDesignMedia(ownerToken, caseId);
    const approvalId = uploadRes.body.approval.id;

    const res = await request(app)
      .post(`/api/approvals/${approvalId}/request-changes`)
      .set('Authorization', `Bearer ${dentistToken}`)
      .send({ comments: 'Margins look off on tooth #14.' });
    expect(res.status).toBe(200);
    expect(res.body.approval.status).toBe('rejected');
    expect(res.body.approval.comments).toBe('Margins look off on tooth #14.');
    expect(res.body.case.current_status).toBe('In Design');
  });

  it('requires comments — 400 without them', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const dentistToken = await grantApprovalPermission(ownerToken);
    const caseId = await createCaseAt(ownerToken, 'In Design');
    const uploadRes = await uploadDesignMedia(ownerToken, caseId);

    const res = await request(app)
      .post(`/api/approvals/${uploadRes.body.approval.id}/request-changes`)
      .set('Authorization', `Bearer ${dentistToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('fires the changes_requested notification to the assigned staff', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const dentistToken = await grantApprovalPermission(ownerToken);
    const caseId = await createCaseAt(ownerToken, 'In Design');

    const staff = await query("SELECT id FROM users WHERE email = 'tech2@dentallab.test'");
    await query('UPDATE cases SET assigned_staff_id = $1 WHERE id = $2', [staff.rows[0].id, caseId]);

    const uploadRes = await uploadDesignMedia(ownerToken, caseId);
    const spy = jest.spyOn(notifications, 'notify');

    await request(app)
      .post(`/api/approvals/${uploadRes.body.approval.id}/request-changes`)
      .set('Authorization', `Bearer ${dentistToken}`)
      .send({ comments: 'Redo the margins.' });

    const call = spy.mock.calls.find((c) => c[0].event === 'changes_requested');
    expect(call).toBeTruthy();
    expect(call[0].recipientUserIds).toEqual([staff.rows[0].id]);
    expect(call[0].payload.comments).toBe('Redo the margins.');
    spy.mockRestore();
  });

  it('409s request-changes on an already-responded approval', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const dentistToken = await grantApprovalPermission(ownerToken);
    const caseId = await createCaseAt(ownerToken, 'In Design');
    const uploadRes = await uploadDesignMedia(ownerToken, caseId);
    const approvalId = uploadRes.body.approval.id;

    await request(app)
      .post(`/api/approvals/${approvalId}/request-changes`)
      .set('Authorization', `Bearer ${dentistToken}`)
      .send({ comments: 'first pass' });

    const res = await request(app)
      .post(`/api/approvals/${approvalId}/request-changes`)
      .set('Authorization', `Bearer ${dentistToken}`)
      .send({ comments: 'second pass' });
    expect(res.status).toBe(409);
  });

  it('the backward move is unreachable directly via PATCH /api/cases/:id/status even after a legitimate revert', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const dentistToken = await grantApprovalPermission(ownerToken);
    const caseId = await createCaseAt(ownerToken, 'In Design');
    const uploadRes = await uploadDesignMedia(ownerToken, caseId);

    // Get the case OFF of 'In Design' first by moving it back to
    // 'Pending Design Approval' via a second design upload, so we can prove
    // the direct backward PATCH attempt 409s regardless of current position.
    await request(app)
      .post(`/api/approvals/${uploadRes.body.approval.id}/request-changes`)
      .set('Authorization', `Bearer ${dentistToken}`)
      .send({ comments: 'try again' });
    // case is now back at 'In Design' (reverted). Re-advance it forward the
    // normal way to 'Pending Design Approval' so a direct backward attempt
    // has a real target to (illegally) go for.
    const reuploadRes = await uploadDesignMedia(ownerToken, caseId, { fileName: 'design_v2.jpg' });
    expect(reuploadRes.status).toBe(201);
    expect(reuploadRes.body.case.current_status).toBe('Pending Design Approval');

    const directRes = await request(app)
      .patch(`/api/cases/${caseId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ newStatus: 'In Design' });
    expect(directRes.status).toBe(409);
  });
});
