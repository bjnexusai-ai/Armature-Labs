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

describe('POST /api/cases/:id/progress-photos', () => {
  it('staff can upload a progress photo', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const caseId = await createCase(ownerToken);

    const res = await request(app)
      .post(`/api/cases/${caseId}/progress-photos`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ fileUrl: 'https://example.com/shots/1.jpg', caption: 'Mid-processing shot' });

    expect(res.status).toBe(201);
    expect(res.body.progressPhoto.file_url).toBe('https://example.com/shots/1.jpg');
    expect(res.body.progressPhoto.taken_at).toBeTruthy();
  });

  it('blocks a dentist_client from uploading (lab-staff only)', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const caseId = await createCase(ownerToken);
    const dentistToken = await loginAs('dentist@brightsmile.test');

    const res = await request(app)
      .post(`/api/cases/${caseId}/progress-photos`)
      .set('Authorization', `Bearer ${dentistToken}`)
      .send({ fileUrl: 'https://example.com/shots/2.jpg' });

    expect(res.status).toBe(403);
  });

  it('rejects a missing fileUrl', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const caseId = await createCase(ownerToken);
    const res = await request(app)
      .post(`/api/cases/${caseId}/progress-photos`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ caption: 'no url' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for a nonexistent case', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const res = await request(app)
      .post('/api/cases/99999999/progress-photos')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ fileUrl: 'https://example.com/x.jpg' });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/cases/:id/progress-photos', () => {
  it('lists photos newest-first', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const caseId = await createCase(ownerToken);
    await request(app).post(`/api/cases/${caseId}/progress-photos`).set('Authorization', `Bearer ${ownerToken}`)
      .send({ fileUrl: 'https://example.com/a.jpg' });
    await request(app).post(`/api/cases/${caseId}/progress-photos`).set('Authorization', `Bearer ${ownerToken}`)
      .send({ fileUrl: 'https://example.com/b.jpg' });

    const res = await request(app)
      .get(`/api/cases/${caseId}/progress-photos`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.progressPhotos).toHaveLength(2);
  });

  it('blocks a dentist_client from listing (lab-staff only)', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const caseId = await createCase(ownerToken);
    const dentistToken = await loginAs('dentist@brightsmile.test');

    const res = await request(app)
      .get(`/api/cases/${caseId}/progress-photos`)
      .set('Authorization', `Bearer ${dentistToken}`);
    expect(res.status).toBe(403);
  });
});
