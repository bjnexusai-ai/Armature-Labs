/**
 * Integration tests against a real Postgres instance (DATABASE_URL from .env).
 * Assumes migrations + seed have already been run. Run with: npm test
 *
 * These are integration tests against persistent seed data (no per-run
 * cleanup), so time-window overlap tests compute windows relative to a
 * large random offset unique to this test-process run, rather than a
 * fixed "now + N hours" — otherwise re-running the suite minutes apart
 * would produce windows that legitimately overlap with the previous run's
 * leftover rows, causing false 409s. Same spirit as this project's
 * existing Date.now()-Math.random() convention for unique names.
 */
const request = require('supertest');
const app = require('../src/app');
const { query } = require('../src/config/db');

const PASSWORD = 'TestPass123!';

// A random offset, in days, far enough in the future that it won't collide
// with real seed data, and randomized per process run so concurrent/rerun
// suites don't collide with each other's leftover rows either.
const RUN_OFFSET_DAYS = 3650 + Math.floor(Math.random() * 3650);

function windowStart(dayOffset, hour = 9) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + RUN_OFFSET_DAYS + dayOffset);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

let uniqueDayCounter = 0;
// Hands each test its own day slot within the run's offset window, so
// tests within the same run also never collide with each other.
function nextTestDaySlot() {
  uniqueDayCounter += 1;
  return uniqueDayCounter;
}

async function loginAs(email) {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.accessToken;
}

async function getTechnicianId() {
  const { rows } = await query(
    `SELECT t.id FROM technicians t JOIN users u ON u.id = t.user_id WHERE u.email = 'tech1@dentallab.test'`
  );
  return rows[0].id;
}

async function createEquipment(token) {
  const res = await request(app)
    .post('/api/equipment')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: `Planning Test Equip ${Date.now()}-${Math.random()}`, equipmentType: 'Printer' });
  expect(res.status).toBe(201);
  return res.body.equipment;
}

describe('Planning — technician shifts', () => {
  it('creates a shift', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const technicianId = await getTechnicianId();
    const day = nextTestDaySlot();

    const res = await request(app)
      .post('/api/planning/shifts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ technicianId, startsAt: windowStart(day, 9), endsAt: windowStart(day, 17) });
    expect(res.status).toBe(201);
    expect(res.body.shift.technician_id).toBe(technicianId);
  });

  it('rejects an overlapping shift for the same technician with 409', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const technicianId = await getTechnicianId();
    const day = nextTestDaySlot();

    const first = await request(app)
      .post('/api/planning/shifts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ technicianId, startsAt: windowStart(day, 9), endsAt: windowStart(day, 17) });
    expect(first.status).toBe(201);

    const overlapping = await request(app)
      .post('/api/planning/shifts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ technicianId, startsAt: windowStart(day, 13), endsAt: windowStart(day, 20) });
    expect(overlapping.status).toBe(409);
  });

  it('allows a back-to-back (non-overlapping) shift for the same technician', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const technicianId = await getTechnicianId();
    const day = nextTestDaySlot();

    const first = await request(app)
      .post('/api/planning/shifts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ technicianId, startsAt: windowStart(day, 9), endsAt: windowStart(day, 13) });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/planning/shifts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ technicianId, startsAt: windowStart(day, 13), endsAt: windowStart(day, 17) });
    expect(second.status).toBe(201);
  });

  it('rejects an invalid window where endsAt is before startsAt', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const technicianId = await getTechnicianId();
    const day = nextTestDaySlot();

    const res = await request(app)
      .post('/api/planning/shifts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ technicianId, startsAt: windowStart(day, 17), endsAt: windowStart(day, 9) });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown technicianId with 400', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const day = nextTestDaySlot();
    const res = await request(app)
      .post('/api/planning/shifts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ technicianId: 999999, startsAt: windowStart(day, 9), endsAt: windowStart(day, 17) });
    expect(res.status).toBe(400);
  });
});

describe('Planning — equipment bookings', () => {
  it('creates a booking, optionally linked to a case', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const equipment = await createEquipment(ownerToken);
    const day = nextTestDaySlot();

    const res = await request(app)
      .post('/api/planning/bookings')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ equipmentId: equipment.id, startsAt: windowStart(day, 9), endsAt: windowStart(day, 11) });
    expect(res.status).toBe(201);
    expect(res.body.booking.equipment_id).toBe(equipment.id);
    expect(res.body.booking.case_id).toBeNull();
  });

  it('rejects an overlapping booking for the same equipment with 409', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const equipment = await createEquipment(ownerToken);
    const day = nextTestDaySlot();

    const first = await request(app)
      .post('/api/planning/bookings')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ equipmentId: equipment.id, startsAt: windowStart(day, 9), endsAt: windowStart(day, 12) });
    expect(first.status).toBe(201);

    const overlapping = await request(app)
      .post('/api/planning/bookings')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ equipmentId: equipment.id, startsAt: windowStart(day, 11), endsAt: windowStart(day, 14) });
    expect(overlapping.status).toBe(409);
  });

  it('a different piece of equipment is unaffected by another equipment\'s booking', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const equipmentA = await createEquipment(ownerToken);
    const equipmentB = await createEquipment(ownerToken);
    const day = nextTestDaySlot();

    const first = await request(app)
      .post('/api/planning/bookings')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ equipmentId: equipmentA.id, startsAt: windowStart(day, 9), endsAt: windowStart(day, 12) });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/planning/bookings')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ equipmentId: equipmentB.id, startsAt: windowStart(day, 9), endsAt: windowStart(day, 12) });
    expect(second.status).toBe(201);
  });

  it('rejects an unknown caseId with 400', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const equipment = await createEquipment(ownerToken);
    const day = nextTestDaySlot();

    const res = await request(app)
      .post('/api/planning/bookings')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        equipmentId: equipment.id,
        caseId: 999999,
        startsAt: windowStart(day, 9),
        endsAt: windowStart(day, 12),
      });
    expect(res.status).toBe(400);
  });

  it('a dentist_client cannot access planning at all', async () => {
    const dentistToken = await loginAs('dentist@brightsmile.test');
    const res = await request(app)
      .get('/api/planning/shifts')
      .set('Authorization', `Bearer ${dentistToken}`);
    expect(res.status).toBe(403);
  });
});
