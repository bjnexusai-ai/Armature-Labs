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

async function createCase(ownerToken, assignedStaffId) {
  const { practiceId, dentistId, caseTypeId } = await getIds();
  const res = await request(app)
    .post('/api/cases')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ practiceId, dentistId, caseTypeId, dueDate: futureDueDate() });
  const caseId = res.body.case.id;
  if (assignedStaffId) {
    await request(app)
      .patch(`/api/cases/${caseId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ assignedStaffId });
  }
  return caseId;
}

beforeEach(() => {
  jest.spyOn(notifications, 'notify');
});
afterEach(() => {
  notifications.notify.mockRestore();
});

describe('POST /api/cases/:id/notes', () => {
  it('staff can create an internal note (default visibility)', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const caseId = await createCase(ownerToken);

    const res = await request(app)
      .post(`/api/cases/${caseId}/notes`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: 'Internal-only remark about margins.' });

    expect(res.status).toBe(201);
    expect(res.body.note.visibility).toBe('internal');
    expect(res.body.note.author_id).toBeTruthy();
  });

  it('staff can explicitly mark a note portal-visible, and it notifies the dental office', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const caseId = await createCase(ownerToken);

    const res = await request(app)
      .post(`/api/cases/${caseId}/notes`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: 'Update for the office.', visibility: 'portal' });

    expect(res.status).toBe(201);
    expect(res.body.note.visibility).toBe('portal');
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'lab_note_created' })
    );
  });

  it('a dentist_client note is always forced to visibility=portal, even if internal is requested', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const managerToken = await loginAs('manager@dentallab.test');
    const staffRow = await query("SELECT id FROM users WHERE email = 'manager@dentallab.test'");
    const caseId = await createCase(ownerToken, staffRow.rows[0].id);

    const dentistToken = await loginAs('dentist@brightsmile.test');
    const res = await request(app)
      .post(`/api/cases/${caseId}/notes`)
      .set('Authorization', `Bearer ${dentistToken}`)
      .send({ body: 'Question from the office.', visibility: 'internal' });

    expect(res.status).toBe(201);
    expect(res.body.note.visibility).toBe('portal');
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'client_note_created', recipientUserIds: [staffRow.rows[0].id] })
    );
    void managerToken;
  });

  it('rejects an empty body', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const caseId = await createCase(ownerToken);
    const res = await request(app)
      .post(`/api/cases/${caseId}/notes`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: '' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for a nonexistent case', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const res = await request(app)
      .post('/api/cases/99999999/notes')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: 'x' });
    expect(res.status).toBe(404);
  });

  it('returns 403 (not a 404 leak) for a dentist_client on a cross-tenant case', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const managerToken = await loginAs('manager@dentallab.test');
    const otherPracticeRes = await request(app)
      .post('/api/practices')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ practiceName: `Notes Isolation Office ${Date.now()}` });
    const otherDentistRes = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        fullName: 'Other Dentist',
        email: `notesdentist_${Date.now()}@x.test`,
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
      .post(`/api/cases/${caseRes.body.case.id}/notes`)
      .set('Authorization', `Bearer ${dentistToken}`)
      .send({ body: 'Should be blocked.' });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/cases/:id/notes', () => {
  it('staff sees both internal and portal notes', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const caseId = await createCase(ownerToken);
    await request(app).post(`/api/cases/${caseId}/notes`).set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: 'internal one' });
    await request(app).post(`/api/cases/${caseId}/notes`).set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: 'portal one', visibility: 'portal' });

    const res = await request(app)
      .get(`/api/cases/${caseId}/notes`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.notes).toHaveLength(2);
  });

  it('a dentist_client only sees portal-visible notes, never internal ones', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const caseId = await createCase(ownerToken);
    await request(app).post(`/api/cases/${caseId}/notes`).set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: 'internal one' });
    await request(app).post(`/api/cases/${caseId}/notes`).set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: 'portal one', visibility: 'portal' });

    const dentistToken = await loginAs('dentist@brightsmile.test');
    const res = await request(app)
      .get(`/api/cases/${caseId}/notes`)
      .set('Authorization', `Bearer ${dentistToken}`);
    expect(res.status).toBe(200);
    expect(res.body.notes).toHaveLength(1);
    expect(res.body.notes[0].visibility).toBe('portal');
  });
});
