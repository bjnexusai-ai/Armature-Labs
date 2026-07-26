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

async function createCategory(token, name) {
  const res = await request(app)
    .post('/api/inventory/categories')
    .set('Authorization', `Bearer ${token}`)
    .send({ name });
  expect(res.status).toBe(201);
  return res.body.category.id;
}

async function createMaterial(token, categoryId, overrides = {}) {
  const res = await request(app)
    .post('/api/inventory/materials')
    .set('Authorization', `Bearer ${token}`)
    .send({
      categoryId,
      name: `Test Material ${Date.now()}-${Math.random()}`,
      unit: 'g',
      unitCost: 10,
      reorderThreshold: 5,
      ...overrides,
    });
  expect(res.status).toBe(201);
  return res.body.material;
}

describe('Inventory — material categories', () => {
  it('Owner can create a category; any internal staff can list categories', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const categoryId = await createCategory(ownerToken, `Zirconia ${Date.now()}`);
    expect(categoryId).toBeTruthy();

    const techToken = await loginAs('tech1@dentallab.test');
    const listRes = await request(app)
      .get('/api/inventory/categories')
      .set('Authorization', `Bearer ${techToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.categories.some((c) => c.id === categoryId)).toBe(true);
  });

  it('a technician (non-manager) cannot create a category', async () => {
    const techToken = await loginAs('tech1@dentallab.test');
    const res = await request(app)
      .post('/api/inventory/categories')
      .set('Authorization', `Bearer ${techToken}`)
      .send({ name: `Should Fail ${Date.now()}` });
    expect(res.status).toBe(403);
  });

  it('a dentist_client (portal user) is blocked entirely from inventory routes', async () => {
    const dentistToken = await loginAs('dentist@brightsmile.test');
    const res = await request(app)
      .get('/api/inventory/categories')
      .set('Authorization', `Bearer ${dentistToken}`);
    expect(res.status).toBe(403);
  });
});

describe('Inventory — materials', () => {
  it('Owner can create a material with an initial stock count, which posts an Adjustment transaction', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const categoryId = await createCategory(ownerToken, `Metals ${Date.now()}`);

    const material = await createMaterial(ownerToken, categoryId, { initialStock: 100 });
    expect(Number(material.current_stock)).toBe(100);

    const txnRes = await request(app)
      .get(`/api/inventory/materials/${material.id}/transactions`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(txnRes.status).toBe(200);
    expect(txnRes.body.stockTransactions).toHaveLength(1);
    expect(txnRes.body.stockTransactions[0].type).toBe('Adjustment');
    expect(Number(txnRes.body.stockTransactions[0].quantity)).toBe(100);
  });

  it('rejects an unknown categoryId with 400, not a raw FK error', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const res = await request(app)
      .post('/api/inventory/materials')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ categoryId: 999999, name: 'Ghost Material', unit: 'g' });
    expect(res.status).toBe(400);
  });

  it('supports filtering by lowStock', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const categoryId = await createCategory(ownerToken, `LowStock ${Date.now()}`);
    const low = await createMaterial(ownerToken, categoryId, { reorderThreshold: 50, initialStock: 10 });
    const healthy = await createMaterial(ownerToken, categoryId, { reorderThreshold: 5, initialStock: 100 });

    const res = await request(app)
      .get('/api/inventory/materials?lowStock=true')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.materials.map((m) => m.id);
    expect(ids).toContain(low.id);
    expect(ids).not.toContain(healthy.id);
  });
});

describe('Inventory — stock transactions (consume / adjust)', () => {
  it('any internal staff (including a technician) can log Consumption, which decrements current_stock', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const categoryId = await createCategory(ownerToken, `Consumables ${Date.now()}`);
    const material = await createMaterial(ownerToken, categoryId, { initialStock: 50 });

    const techToken = await loginAs('tech1@dentallab.test');
    const res = await request(app)
      .post(`/api/inventory/materials/${material.id}/consume`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ quantity: 20, lotNumber: 'LOT-A1' });

    expect(res.status).toBe(201);
    expect(Number(res.body.stockTransaction.quantity)).toBe(-20);
    expect(res.body.stockTransaction.type).toBe('Consumption');
    expect(Number(res.body.material.current_stock)).toBe(30);
  });

  it('rejects Consumption that would take current_stock negative', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const categoryId = await createCategory(ownerToken, `Consumables2 ${Date.now()}`);
    const material = await createMaterial(ownerToken, categoryId, { initialStock: 5 });

    const res = await request(app)
      .post(`/api/inventory/materials/${material.id}/consume`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ quantity: 10, lotNumber: 'LOT-B1' });

    expect(res.status).toBe(409);
  });

  it('a technician cannot post an Adjustment (Owner/Office Manager only)', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const categoryId = await createCategory(ownerToken, `AdjustGate ${Date.now()}`);
    const material = await createMaterial(ownerToken, categoryId, { initialStock: 10 });

    const techToken = await loginAs('tech1@dentallab.test');
    const res = await request(app)
      .post(`/api/inventory/materials/${material.id}/adjust`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ quantity: 5, lotNumber: 'LOT-C1', notes: 'Recount' });

    expect(res.status).toBe(403);
  });

  it('Owner can post a negative Adjustment (correction), and it is honored as-signed', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const categoryId = await createCategory(ownerToken, `AdjustSign ${Date.now()}`);
    const material = await createMaterial(ownerToken, categoryId, { initialStock: 20 });

    const res = await request(app)
      .post(`/api/inventory/materials/${material.id}/adjust`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ quantity: -6, lotNumber: 'LOT-D1', notes: 'Damaged in storage' });

    expect(res.status).toBe(201);
    expect(Number(res.body.stockTransaction.quantity)).toBe(-6);
    expect(Number(res.body.material.current_stock)).toBe(14);
  });

  it('rejects a stock transaction missing lotNumber', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const categoryId = await createCategory(ownerToken, `LotRequired ${Date.now()}`);
    const material = await createMaterial(ownerToken, categoryId, { initialStock: 10 });

    const res = await request(app)
      .post(`/api/inventory/materials/${material.id}/consume`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ quantity: 1 });

    expect(res.status).toBe(400);
  });
});
