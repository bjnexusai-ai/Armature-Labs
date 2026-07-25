/**
 * Integration tests against a real Postgres instance (DATABASE_URL from .env).
 * Assumes migrations + seed have already been run (see README "Running tests").
 * Run with: npm test
 */
const request = require('supertest');
const app = require('../src/app');

const PASSWORD = 'TestPass123!';

async function loginAs(email) {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.accessToken;
}

describe('Health check', () => {
  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Auth', () => {
  it('rejects an unknown email with 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@dentallab.test', password: PASSWORD });
    expect(res.status).toBe(401);
  });

  it('rejects a wrong password with 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@dentallab.test', password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  it('logs in the seeded owner and returns tokens + user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@dentallab.test', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.user.role).toBe('owner');
  });

  it('rejects requests with no Authorization header', async () => {
    const res = await request(app).get('/api/practices');
    expect(res.status).toBe(401);
  });

  it('rejects requests with a garbage token', async () => {
    const res = await request(app)
      .get('/api/practices')
      .set('Authorization', 'Bearer garbage.token.here');
    expect(res.status).toBe(401);
  });

  it('refresh returns a new access token', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@dentallab.test', password: PASSWORD });
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: loginRes.body.refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });
});

describe('Role-based access control', () => {
  it('blocks assistant_technician from creating users (owner/office_manager only)', async () => {
    const token = await loginAs('tech1@dentallab.test');
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'X', email: `blocked_${Date.now()}@x.com`, password: 'password123', role: 'designer' });
    expect(res.status).toBe(403);
  });

  it('allows owner to create a user', async () => {
    const token = await loginAs('owner@dentallab.test');
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fullName: 'RBAC Test User',
        email: `rbactest_${Date.now()}@dentallab.test`,
        password: 'password123',
        role: 'assistant_technician',
      });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('assistant_technician');
  });

  it('rejects duplicate email with 409', async () => {
    const token = await loginAs('owner@dentallab.test');
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Dup', email: 'owner@dentallab.test', password: 'password123', role: 'office_manager' });
    expect(res.status).toBe(409);
  });

  it('rejects a too-short password with 400 and a clear validation message', async () => {
    const token = await loginAs('owner@dentallab.test');
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'X', email: `shortpw_${Date.now()}@x.com`, password: 'short', role: 'designer' });
    expect(res.status).toBe(400);
    expect(res.body.details[0].path).toBe('password');
  });
});

describe('Server-side tenant isolation', () => {
  it('a dentist_client only sees their own practice in the practices list', async () => {
    const token = await loginAs('dentist@brightsmile.test');
    const res = await request(app).get('/api/practices').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.practices.length).toBe(1);
    expect(res.body.practices[0].practice_name).toBe('Bright Smile Dental Clinic');
  });

  it('a dentist_client is blocked (403) from fetching a different practice by id', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const createRes = await request(app)
      .post('/api/practices')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ practiceName: `Isolated Office ${Date.now()}` });
    const otherPracticeId = createRes.body.practice.id;

    const dentistToken = await loginAs('dentist@brightsmile.test');
    const res = await request(app)
      .get(`/api/practices/${otherPracticeId}`)
      .set('Authorization', `Bearer ${dentistToken}`);
    expect(res.status).toBe(403);
  });

  it('internal staff (owner) see every practice, unfiltered', async () => {
    const token = await loginAs('owner@dentallab.test');
    const res = await request(app).get('/api/practices').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.practices.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Reference data', () => {
  it('returns the 7 seeded case types', async () => {
    const token = await loginAs('owner@dentallab.test');
    const res = await request(app).get('/api/reference/case-types').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.caseTypes.length).toBe(7);
  });

  it('returns the 7-step workflow stages in sequence order', async () => {
    const token = await loginAs('owner@dentallab.test');
    const res = await request(app).get('/api/reference/workflow-stages').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.workflowStages.map((s) => s.name)).toEqual([
      'Submitted', 'Intake', 'Design', 'Review', 'Production', 'QC', 'Shipping',
    ]);
  });

  it('returns the 5 seeded roles', async () => {
    const token = await loginAs('owner@dentallab.test');
    const res = await request(app).get('/api/reference/roles').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.roles.length).toBe(5);
  });
});

describe('404 handling', () => {
  it('returns a clean 404 for unknown routes', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.status).toBe(404);
  });
});
