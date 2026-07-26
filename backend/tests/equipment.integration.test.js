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

async function createEquipment(token, overrides = {}) {
  const res = await request(app)
    .post('/api/equipment')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: `Test Mill ${Date.now()}-${Math.random()}`,
      equipmentType: 'Milling Machine',
      serialNumber: `SN-${Date.now()}`,
      ...overrides,
    });
  expect(res.status).toBe(201);
  return res.body.equipment;
}

describe('Equipment — catalog', () => {
  it('Owner can create equipment; date field is null until a maintenance log sets it', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const equipment = await createEquipment(ownerToken);
    expect(equipment.status).toBe('Active');
    expect(equipment.next_maintenance_due_date).toBeNull();
  });

  it('a technician cannot create equipment', async () => {
    const techToken = await loginAs('tech1@dentallab.test');
    const res = await request(app)
      .post('/api/equipment')
      .set('Authorization', `Bearer ${techToken}`)
      .send({ name: 'Should Fail', equipmentType: 'Printer' });
    expect(res.status).toBe(403);
  });

  it('Owner can update equipment status', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const equipment = await createEquipment(ownerToken);
    const res = await request(app)
      .patch(`/api/equipment/${equipment.id}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'Under Maintenance' });
    expect(res.status).toBe(200);
    expect(res.body.equipment.status).toBe('Under Maintenance');
  });

  it('any internal staff can list and read equipment', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const techToken = await loginAs('tech1@dentallab.test');
    const equipment = await createEquipment(ownerToken);

    const listRes = await request(app)
      .get('/api/equipment')
      .set('Authorization', `Bearer ${techToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.equipment.some((e) => e.id === equipment.id)).toBe(true);
  });

  it('a dentist_client cannot access equipment at all', async () => {
    const dentistToken = await loginAs('dentist@brightsmile.test');
    const res = await request(app)
      .get('/api/equipment')
      .set('Authorization', `Bearer ${dentistToken}`);
    expect(res.status).toBe(403);
  });
});

describe('Equipment — maintenance logs', () => {
  it('a technician can log maintenance and set next_maintenance_due_date on the equipment', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const techToken = await loginAs('tech1@dentallab.test');
    const equipment = await createEquipment(ownerToken);

    const logRes = await request(app)
      .post(`/api/equipment/${equipment.id}/maintenance-logs`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ logType: 'Routine', nextDueDate: '2027-01-15', notes: 'Routine service' });
    expect(logRes.status).toBe(201);
    // Regression check for the date-serialization bug: this must be a plain
    // date string, not a full ISO timestamp.
    expect(logRes.body.maintenanceLog.next_due_date).toBe('2027-01-15');

    const getRes = await request(app)
      .get(`/api/equipment/${equipment.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(getRes.body.equipment.next_maintenance_due_date).toBe('2027-01-15');
  });

  it('a maintenance log with no nextDueDate does not wipe an existing next_maintenance_due_date', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const equipment = await createEquipment(ownerToken);

    const firstLog = await request(app)
      .post(`/api/equipment/${equipment.id}/maintenance-logs`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ logType: 'Routine', nextDueDate: '2027-03-01' });
    expect(firstLog.status).toBe(201);

    const secondLog = await request(app)
      .post(`/api/equipment/${equipment.id}/maintenance-logs`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ logType: 'Repair', notes: 'Emergency repair, no new schedule yet' });
    expect(secondLog.status).toBe(201);
    expect(secondLog.body.maintenanceLog.next_due_date).toBeNull();

    const getRes = await request(app)
      .get(`/api/equipment/${equipment.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(getRes.body.equipment.next_maintenance_due_date).toBe('2027-03-01');
  });

  it('lists maintenance logs newest-first', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const equipment = await createEquipment(ownerToken);

    await request(app)
      .post(`/api/equipment/${equipment.id}/maintenance-logs`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ logType: 'Inspection', notes: 'first' });
    const second = await request(app)
      .post(`/api/equipment/${equipment.id}/maintenance-logs`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ logType: 'Inspection', notes: 'second' });

    const listRes = await request(app)
      .get(`/api/equipment/${equipment.id}/maintenance-logs`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.maintenanceLogs[0].id).toBe(second.body.maintenanceLog.id);
  });

  it('404s for a maintenance log on nonexistent equipment', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const res = await request(app)
      .post('/api/equipment/999999/maintenance-logs')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ logType: 'Routine' });
    expect(res.status).toBe(404);
  });
});
