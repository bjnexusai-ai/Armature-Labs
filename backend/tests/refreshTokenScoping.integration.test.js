const request = require('supertest');
const app = require('../src/app');

describe('refresh token scoping (B10 regression)', () => {
  it('logging out one session does not invalidate a different session', async () => {
    const sessionA = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@dentallab.test', password: 'TestPass123!' });
    const sessionB = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@dentallab.test', password: 'TestPass123!' });

    expect(sessionA.status).toBe(200);
    expect(sessionB.status).toBe(200);

    await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken: sessionA.body.refreshToken });

    // Session B must still work — this is the exact bug from the earlier
    // B10 attempt: logging out A must never affect B.
    const refreshB = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: sessionB.body.refreshToken });

    expect(refreshB.status).toBe(200);
    expect(refreshB.body.accessToken).toBeDefined();

    // And A must correctly be rejected.
    const refreshA = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: sessionA.body.refreshToken });

    expect(refreshA.status).toBe(401);
    expect(refreshA.body.error).toMatch(/signed out/i);
  });
});
