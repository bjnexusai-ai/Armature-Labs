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

// Creates a second practice + dentist_client (WITHOUT can_edit_patient_info)
// purely for cross-tenant isolation assertions — nothing this specific is
// seeded, so the tests build their own fixture via the real API, same
// approach the notes/cases suites use for one-off fixtures.
async function createSecondPracticeAndDentist(ownerToken) {
  const practiceRes = await request(app)
    .post('/api/practices')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({
      practiceName: `Other Practice ${Date.now()}`,
      city: 'Austin',
      state: 'TX',
      phone: '555-0100',
    });
  expect(practiceRes.status).toBe(201);
  const otherPracticeId = practiceRes.body.practice.id;

  const email = `dentist-other-${Date.now()}@example.test`;
  const userRes = await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({
      fullName: 'Other Dentist',
      email,
      password: PASSWORD,
      role: 'dentist_client',
      practiceId: Number(otherPracticeId),
      canEditPatientInfo: false,
    });
  expect(userRes.status).toBe(201);

  return { otherPracticeId, otherDentistEmail: email };
}

describe('POST /api/patients', () => {
  it('allows internal staff (owner) to create a patient at any practice', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const practiceId = await getBrightSmilePracticeId();

    const res = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ practiceId, firstName: 'Jamie', lastName: 'Rivera' });

    expect(res.status).toBe(201);
    expect(res.body.patient.first_name).toBe('Jamie');
    expect(res.body.patient.last_name).toBe('Rivera');
    expect(res.body.patient.practice_id).toBe(practiceId);
  });

  it('allows a dentist_client with can_edit_patient_info to create a patient at their own practice', async () => {
    const dentistToken = await loginAs('dentist@brightsmile.test');
    const practiceId = await getBrightSmilePracticeId();

    const res = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${dentistToken}`)
      .send({ practiceId, firstName: 'Casey', lastName: 'Nguyen' });

    expect(res.status).toBe(201);
    expect(res.body.patient.first_name).toBe('Casey');
  });

  it('blocks a dentist_client without can_edit_patient_info with 403', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const { otherPracticeId, otherDentistEmail } = await createSecondPracticeAndDentist(ownerToken);
    const otherDentistToken = await loginAs(otherDentistEmail);

    const res = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${otherDentistToken}`)
      .send({ practiceId: Number(otherPracticeId), firstName: 'Blocked', lastName: 'User' });

    expect(res.status).toBe(403);
  });

  it('blocks a dentist_client from creating a patient at a practice that is not their own, with 403', async () => {
    const dentistToken = await loginAs('dentist@brightsmile.test');
    const ownerToken = await loginAs('owner@dentallab.test');
    const { otherPracticeId } = await createSecondPracticeAndDentist(ownerToken);

    const res = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${dentistToken}`)
      .send({ practiceId: Number(otherPracticeId), firstName: 'Cross', lastName: 'Tenant' });

    expect(res.status).toBe(403);
  });

  it('rejects a practiceId that does not exist with 400', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const res = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ practiceId: 999999, firstName: 'Ghost', lastName: 'Practice' });
    expect(res.status).toBe(400);
  });

  it('rejects a missing lastName with 400', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const practiceId = await getBrightSmilePracticeId();
    const res = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ practiceId, firstName: 'NoLastName' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/patients', () => {
  it('lists patients scoped to the dentist_client\'s own practice only', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const { otherPracticeId } = await createSecondPracticeAndDentist(ownerToken);
    await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ practiceId: Number(otherPracticeId), firstName: 'ShouldNot', lastName: 'Appear' });

    const dentistToken = await loginAs('dentist@brightsmile.test');
    const res = await request(app)
      .get('/api/patients')
      .set('Authorization', `Bearer ${dentistToken}`);

    expect(res.status).toBe(200);
    const otherPracticePatients = res.body.patients.filter((p) => p.practice_id === otherPracticeId);
    expect(otherPracticePatients).toHaveLength(0);
  });

  it('rejects a dentist_client attempt to filter by practiceId with 400', async () => {
    const dentistToken = await loginAs('dentist@brightsmile.test');
    const practiceId = await getBrightSmilePracticeId();
    const res = await request(app)
      .get(`/api/patients?practiceId=${practiceId}`)
      .set('Authorization', `Bearer ${dentistToken}`);
    expect(res.status).toBe(400);
  });

  it('allows internal staff to filter by practiceId', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const practiceId = await getBrightSmilePracticeId();
    const res = await request(app)
      .get(`/api/patients?practiceId=${practiceId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.patients.every((p) => p.practice_id === practiceId)).toBe(true);
  });
});

describe('GET /api/patients/:id', () => {
  it('returns a patient by id for internal staff', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const practiceId = await getBrightSmilePracticeId();
    const created = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ practiceId, firstName: 'Fetch', lastName: 'Me' });

    const res = await request(app)
      .get(`/api/patients/${created.body.patient.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.patient.first_name).toBe('Fetch');
  });

  it('returns 404 for a nonexistent patient', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const res = await request(app)
      .get('/api/patients/999999')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(404);
  });

  it('returns 403, not 404, when a dentist_client requests a patient from another practice', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const { otherPracticeId } = await createSecondPracticeAndDentist(ownerToken);
    const created = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ practiceId: Number(otherPracticeId), firstName: 'Other', lastName: 'Practice' });

    const dentistToken = await loginAs('dentist@brightsmile.test');
    const res = await request(app)
      .get(`/api/patients/${created.body.patient.id}`)
      .set('Authorization', `Bearer ${dentistToken}`);

    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/patients/:id', () => {
  it('allows internal staff to update a patient\'s name', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const practiceId = await getBrightSmilePracticeId();
    const created = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ practiceId, firstName: 'Before', lastName: 'Edit' });

    const res = await request(app)
      .patch(`/api/patients/${created.body.patient.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ firstName: 'After' });

    expect(res.status).toBe(200);
    expect(res.body.patient.first_name).toBe('After');
    expect(res.body.patient.last_name).toBe('Edit');
  });

  it('blocks a dentist_client without can_edit_patient_info from updating, with 403', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const practiceId = await getBrightSmilePracticeId();
    const created = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ practiceId, firstName: 'Locked', lastName: 'Down' });

    const { otherDentistEmail } = await createSecondPracticeAndDentist(ownerToken);
    const otherDentistToken = await loginAs(otherDentistEmail);

    const res = await request(app)
      .patch(`/api/patients/${created.body.patient.id}`)
      .set('Authorization', `Bearer ${otherDentistToken}`)
      .send({ firstName: 'Hacked' });

    expect(res.status).toBe(403);
  });

  it('rejects an empty update body with 400', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const practiceId = await getBrightSmilePracticeId();
    const created = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ practiceId, firstName: 'No', lastName: 'Changes' });

    const res = await request(app)
      .patch(`/api/patients/${created.body.patient.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 404 when patching a nonexistent patient', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const res = await request(app)
      .patch('/api/patients/999999')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ firstName: 'Ghost' });
    expect(res.status).toBe(404);
  });
});

describe('cases.patient_id backfill (Session 5.5 migration 0025)', () => {
  it('links every legacy case with a non-null patient_name to a patients row', async () => {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS unlinked
       FROM cases c
       WHERE c.patient_name IS NOT NULL AND c.patient_id IS NULL
         AND c.created_at < (SELECT run_on FROM pgmigrations WHERE name = '0025_backfill_case_patient_id')`
    );
    expect(rows[0].unlinked).toBe(0);
  });

  it('does not duplicate patients for cases sharing the same practice + patient_name', async () => {
    const { rows } = await query(
      `SELECT p.practice_id, p.first_name, p.last_name, COUNT(*)::int AS dupes
       FROM patients p
       WHERE p.created_at < (SELECT run_on FROM pgmigrations WHERE name = '0025_backfill_case_patient_id')
       GROUP BY p.practice_id, p.first_name, p.last_name
       HAVING COUNT(*) > 1`
    );
    expect(rows).toHaveLength(0);
  });
});
