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

async function createVendor(token) {
  const res = await request(app)
    .post('/api/procurement/vendors')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: `Test Vendor ${Date.now()}-${Math.random()}`, contactName: 'Jane Rep', email: 'rep@vendor.test' });
  expect(res.status).toBe(201);
  return res.body.vendor;
}

async function createMaterial(token) {
  const catRes = await request(app)
    .post('/api/inventory/categories')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: `PO Category ${Date.now()}-${Math.random()}` });
  expect(catRes.status).toBe(201);

  const matRes = await request(app)
    .post('/api/inventory/materials')
    .set('Authorization', `Bearer ${token}`)
    .send({ categoryId: catRes.body.category.id, name: `PO Material ${Date.now()}`, unit: 'g', unitCost: 5 });
  expect(matRes.status).toBe(201);
  return matRes.body.material;
}

describe('Procurement — vendors', () => {
  it('Owner can create and list vendors', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const vendor = await createVendor(ownerToken);

    const listRes = await request(app)
      .get('/api/procurement/vendors')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.vendors.some((v) => v.id === vendor.id)).toBe(true);
  });

  it('a technician cannot create a vendor', async () => {
    const techToken = await loginAs('tech1@dentallab.test');
    const res = await request(app)
      .post('/api/procurement/vendors')
      .set('Authorization', `Bearer ${techToken}`)
      .send({ name: 'Should Fail Vendor' });
    expect(res.status).toBe(403);
  });
});

describe('Procurement — purchase orders', () => {
  it('Owner can create a PO with items; po_number auto-generates', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const vendor = await createVendor(ownerToken);
    const material = await createMaterial(ownerToken);

    const res = await request(app)
      .post('/api/procurement/purchase-orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        vendorId: vendor.id,
        items: [{ materialId: material.id, quantityOrdered: 100, unitCost: 4.5 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.purchaseOrder.po_number).toMatch(/^PO-\d{4}-\d{4}$/);
    expect(res.body.purchaseOrder.status).toBe('Draft');
    expect(res.body.purchaseOrder.items).toHaveLength(1);
  });

  it('rejects an unknown vendorId with 400', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const material = await createMaterial(ownerToken);
    const res = await request(app)
      .post('/api/procurement/purchase-orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ vendorId: 999999, items: [{ materialId: material.id, quantityOrdered: 1, unitCost: 1 }] });
    expect(res.status).toBe(400);
  });

  it('Draft -> Ordered transition works via PATCH status', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const vendor = await createVendor(ownerToken);
    const material = await createMaterial(ownerToken);
    const createRes = await request(app)
      .post('/api/procurement/purchase-orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ vendorId: vendor.id, items: [{ materialId: material.id, quantityOrdered: 10, unitCost: 1 }] });

    const poId = createRes.body.purchaseOrder.id;
    const patchRes = await request(app)
      .patch(`/api/procurement/purchase-orders/${poId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'Ordered' });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.purchaseOrder.status).toBe('Ordered');
  });
});

describe('Procurement — receiving', () => {
  it('fully receiving all items sets PO status to Received and increments material current_stock', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const vendor = await createVendor(ownerToken);
    const material = await createMaterial(ownerToken);

    const createRes = await request(app)
      .post('/api/procurement/purchase-orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ vendorId: vendor.id, items: [{ materialId: material.id, quantityOrdered: 50, unitCost: 2 }] });
    const po = createRes.body.purchaseOrder;

    const receiveRes = await request(app)
      .post(`/api/procurement/purchase-orders/${po.id}/receive`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ items: [{ purchaseOrderItemId: po.items[0].id, quantityReceived: 50, lotNumber: 'LOT-PO-1' }] });

    expect(receiveRes.status).toBe(201);
    expect(receiveRes.body.purchaseOrder.status).toBe('Received');
    expect(receiveRes.body.stockTransactions[0].type).toBe('Receiving');

    const materialRes = await request(app)
      .get(`/api/inventory/materials/${material.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(Number(materialRes.body.material.current_stock)).toBe(50);
  });

  it('partially receiving sets status to Partially Received, and a second receive completes it', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const vendor = await createVendor(ownerToken);
    const material = await createMaterial(ownerToken);

    const createRes = await request(app)
      .post('/api/procurement/purchase-orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ vendorId: vendor.id, items: [{ materialId: material.id, quantityOrdered: 100, unitCost: 1 }] });
    const po = createRes.body.purchaseOrder;
    const itemId = po.items[0].id;

    const firstReceive = await request(app)
      .post(`/api/procurement/purchase-orders/${po.id}/receive`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ items: [{ purchaseOrderItemId: itemId, quantityReceived: 40, lotNumber: 'LOT-PO-2A' }] });
    expect(firstReceive.status).toBe(201);
    expect(firstReceive.body.purchaseOrder.status).toBe('Partially Received');

    const secondReceive = await request(app)
      .post(`/api/procurement/purchase-orders/${po.id}/receive`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ items: [{ purchaseOrderItemId: itemId, quantityReceived: 60, lotNumber: 'LOT-PO-2B' }] });
    expect(secondReceive.status).toBe(201);
    expect(secondReceive.body.purchaseOrder.status).toBe('Received');
  });

  it('rejects receiving more than the remaining quantity on an item', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const vendor = await createVendor(ownerToken);
    const material = await createMaterial(ownerToken);

    const createRes = await request(app)
      .post('/api/procurement/purchase-orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ vendorId: vendor.id, items: [{ materialId: material.id, quantityOrdered: 10, unitCost: 1 }] });
    const po = createRes.body.purchaseOrder;

    const res = await request(app)
      .post(`/api/procurement/purchase-orders/${po.id}/receive`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ items: [{ purchaseOrderItemId: po.items[0].id, quantityReceived: 999, lotNumber: 'LOT-OVER' }] });

    expect(res.status).toBe(400);
  });

  it('cannot receive against a Cancelled purchase order', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const vendor = await createVendor(ownerToken);
    const material = await createMaterial(ownerToken);

    const createRes = await request(app)
      .post('/api/procurement/purchase-orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ vendorId: vendor.id, items: [{ materialId: material.id, quantityOrdered: 10, unitCost: 1 }] });
    const po = createRes.body.purchaseOrder;

    const cancelRes = await request(app)
      .patch(`/api/procurement/purchase-orders/${po.id}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'Cancelled' });
    expect(cancelRes.status).toBe(200);

    const receiveRes = await request(app)
      .post(`/api/procurement/purchase-orders/${po.id}/receive`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ items: [{ purchaseOrderItemId: po.items[0].id, quantityReceived: 1, lotNumber: 'LOT-X' }] });
    expect(receiveRes.status).toBe(409);
  });
});
