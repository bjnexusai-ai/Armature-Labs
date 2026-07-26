/**
 * Integration tests against a real Postgres instance (DATABASE_URL from .env).
 * Assumes migrations + seed have already been run. Run with: npm test
 */
const request = require('supertest');
const app = require('../src/app');

const PASSWORD = 'TestPass123!';

async function loginAs(email) {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.accessToken;
}

describe('Reports — saved reports', () => {
  it('Owner can create and list a saved report', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');

    const createRes = await request(app)
      .post('/api/reports/saved-reports')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: `Weekly Case Volume ${Date.now()}-${Math.random()}`,
        reportType: 'Case Volume',
        filters: { practiceId: null, dateRange: 'last_7_days' },
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.savedReport.report_type).toBe('Case Volume');
    expect(createRes.body.savedReport.filters).toEqual({ practiceId: null, dateRange: 'last_7_days' });

    const listRes = await request(app)
      .get('/api/reports/saved-reports')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.savedReports.some((r) => r.id === createRes.body.savedReport.id)).toBe(true);
  });

  it('a technician can save a non-Revenue report', async () => {
    const techToken = await loginAs('tech1@dentallab.test');
    const res = await request(app)
      .post('/api/reports/saved-reports')
      .set('Authorization', `Bearer ${techToken}`)
      .send({ name: `Tech Turnaround ${Date.now()}`, reportType: 'Turnaround Time', filters: {} });
    expect(res.status).toBe(201);
  });

  it('a technician cannot save a Revenue report', async () => {
    const techToken = await loginAs('tech1@dentallab.test');
    const res = await request(app)
      .post('/api/reports/saved-reports')
      .set('Authorization', `Bearer ${techToken}`)
      .send({ name: `Tech Revenue Attempt ${Date.now()}`, reportType: 'Revenue', filters: {} });
    expect(res.status).toBe(403);
  });

  it('Office Manager can save a Revenue report', async () => {
    const managerToken = await loginAs('manager@dentallab.test');
    const res = await request(app)
      .post('/api/reports/saved-reports')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: `Manager Revenue ${Date.now()}`, reportType: 'Revenue', filters: {} });
    expect(res.status).toBe(201);
  });

  it('a user can only see their own saved reports, and can delete their own', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const techToken = await loginAs('tech1@dentallab.test');

    const ownerReport = await request(app)
      .post('/api/reports/saved-reports')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Owner Only Report ${Date.now()}-${Math.random()}`, reportType: 'Case Volume', filters: {} });
    expect(ownerReport.status).toBe(201);

    const techList = await request(app)
      .get('/api/reports/saved-reports')
      .set('Authorization', `Bearer ${techToken}`);
    expect(techList.status).toBe(200);
    expect(techList.body.savedReports.some((r) => r.id === ownerReport.body.savedReport.id)).toBe(false);

    const techDeleteAttempt = await request(app)
      .delete(`/api/reports/saved-reports/${ownerReport.body.savedReport.id}`)
      .set('Authorization', `Bearer ${techToken}`);
    // Owner-owned row is invisible to tech's own scope but Owner role is
    // allowed to delete anyone's — tech is neither the owner nor the Owner
    // role, so this must be forbidden.
    expect(techDeleteAttempt.status).toBe(403);

    const ownerDelete = await request(app)
      .delete(`/api/reports/saved-reports/${ownerReport.body.savedReport.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(ownerDelete.status).toBe(204);
  });

  it('a dentist_client cannot access saved reports at all', async () => {
    const dentistToken = await loginAs('dentist@brightsmile.test');
    const res = await request(app)
      .get('/api/reports/saved-reports')
      .set('Authorization', `Bearer ${dentistToken}`);
    expect(res.status).toBe(403);
  });
});
