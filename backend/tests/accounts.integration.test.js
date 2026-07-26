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

async function getBrightSmilePracticeId() {
  const practice = await query("SELECT id FROM practices WHERE practice_name = 'Bright Smile Dental Clinic'");
  return practice.rows[0].id;
}

describe('Accounts — practice contracts', () => {
  it('Owner can create a contract for a practice', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const practiceId = await getBrightSmilePracticeId();

    const res = await request(app)
      .post(`/api/practices/${practiceId}/contracts`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ paymentTerms: 'Net 30', creditLimit: 5000, contractStartDate: '2026-01-01' });

    expect(res.status).toBe(201);
    expect(res.body.contract.payment_terms).toBe('Net 30');
    expect(Number(res.body.contract.credit_limit)).toBe(5000);
    expect(res.body.contract.practice_id).toBe(practiceId);
  });

  it('lists contracts newest-first', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const practiceId = await getBrightSmilePracticeId();

    await request(app)
      .post(`/api/practices/${practiceId}/contracts`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ paymentTerms: 'Due on Receipt', contractStartDate: '2025-01-01', contractEndDate: '2025-12-31' });
    const second = await request(app)
      .post(`/api/practices/${practiceId}/contracts`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ paymentTerms: 'Net 60', contractStartDate: '2026-01-01' });

    const listRes = await request(app)
      .get(`/api/practices/${practiceId}/contracts`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.contracts[0].id).toBe(second.body.contract.id);
  });

  it('a technician cannot create a practice contract', async () => {
    const techToken = await loginAs('tech1@dentallab.test');
    const practiceId = await getBrightSmilePracticeId();

    const res = await request(app)
      .post(`/api/practices/${practiceId}/contracts`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ paymentTerms: 'Net 30', contractStartDate: '2026-01-01' });
    expect(res.status).toBe(403);
  });

  it('a dentist_client cannot access practice contracts at all', async () => {
    const dentistToken = await loginAs('dentist@brightsmile.test');
    const practiceId = await getBrightSmilePracticeId();

    const res = await request(app)
      .get(`/api/practices/${practiceId}/contracts`)
      .set('Authorization', `Bearer ${dentistToken}`);
    expect(res.status).toBe(403);
  });
});

describe('Accounts — practice notes', () => {
  it('Owner can create and list practice notes', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const practiceId = await getBrightSmilePracticeId();

    const createRes = await request(app)
      .post(`/api/practices/${practiceId}/notes`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ body: 'Called re: Q3 pricing discussion.' });
    expect(createRes.status).toBe(201);
    expect(createRes.body.note.body).toBe('Called re: Q3 pricing discussion.');

    const listRes = await request(app)
      .get(`/api/practices/${practiceId}/notes`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.notes.some((n) => n.id === createRes.body.note.id)).toBe(true);
  });

  it('a dentist_client cannot access practice notes', async () => {
    const dentistToken = await loginAs('dentist@brightsmile.test');
    const practiceId = await getBrightSmilePracticeId();

    const res = await request(app)
      .get(`/api/practices/${practiceId}/notes`)
      .set('Authorization', `Bearer ${dentistToken}`);
    expect(res.status).toBe(403);
  });
});
