/**
 * Integration tests against a real Postgres instance (DATABASE_URL from .env).
 * Assumes migrations + seed have already been run. Run with: npm test
 *
 * Stripe Connect SDK calls are mocked at the module boundary
 * (src/services/stripeClient.js) — nothing here hits the real Stripe API.
 */
jest.mock('../src/services/stripeClient', () => ({
  accounts: { create: jest.fn() },
  accountLinks: { create: jest.fn() },
  transfers: { create: jest.fn() },
}));

const request = require('supertest');
const app = require('../src/app');
const stripeClient = require('../src/services/stripeClient');

const PASSWORD = 'TestPass123!';

async function loginAs(email) {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.accessToken;
}

async function createManufacturer(token, overrides = {}) {
  const res = await request(app)
    .post('/api/manufacturers')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: `Test Manufacturer ${Date.now()}-${Math.random()}`,
      contactName: 'Priya Rao',
      email: 'priya@manufacturer.test',
      country: 'US',
      ...overrides,
    });
  expect(res.status).toBe(201);
  return res.body.manufacturer;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Manufacturers — CRUD', () => {
  it('Owner can create, list, get, and update a manufacturer', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const manufacturer = await createManufacturer(ownerToken);

    const listRes = await request(app).get('/api/manufacturers').set('Authorization', `Bearer ${ownerToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.manufacturers.some((m) => m.id === manufacturer.id)).toBe(true);

    const getRes = await request(app)
      .get(`/api/manufacturers/${manufacturer.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.manufacturer.connect_status).toBe('Not Started');

    const updateRes = await request(app)
      .patch(`/api/manufacturers/${manufacturer.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ contactName: 'Priya R. Updated' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.manufacturer.contact_name).toBe('Priya R. Updated');
  });

  it('Office Manager can create a manufacturer', async () => {
    const managerToken = await loginAs('manager@dentallab.test');
    const manufacturer = await createManufacturer(managerToken);
    expect(manufacturer.country).toBe('US');
  });

  it('a Technician (non-manager role) is blocked from manufacturer CRUD', async () => {
    const techToken = await loginAs('tech1@dentallab.test');
    const res = await request(app)
      .post('/api/manufacturers')
      .set('Authorization', `Bearer ${techToken}`)
      .send({ name: 'Blocked Attempt', country: 'US' });
    expect(res.status).toBe(403);
  });

  it('a dentist_client portal user is blocked from manufacturer CRUD', async () => {
    const dentistToken = await loginAs('dentist@brightsmile.test');
    const res = await request(app)
      .get('/api/manufacturers')
      .set('Authorization', `Bearer ${dentistToken}`);
    expect(res.status).toBe(403);
  });
});

describe('Manufacturers — Connect onboarding link', () => {
  it('creates a Stripe Connect account on first onboarding-link request and returns a URL', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const manufacturer = await createManufacturer(ownerToken, { country: 'US' });

    stripeClient.accounts.create.mockResolvedValueOnce({ id: 'acct_test_1' });
    stripeClient.accountLinks.create.mockResolvedValueOnce({
      url: 'https://connect.stripe.com/setup/test_1',
      expires_at: 1999999999,
    });

    const res = await request(app)
      .post(`/api/manufacturers/${manufacturer.id}/connect-onboarding-link`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send();

    expect(res.status).toBe(201);
    expect(res.body.onboardingLink.url).toBe('https://connect.stripe.com/setup/test_1');
    expect(stripeClient.accounts.create).toHaveBeenCalledTimes(1);
    expect(stripeClient.accounts.create.mock.calls[0][0].country).toBe('US');

    const getRes = await request(app)
      .get(`/api/manufacturers/${manufacturer.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(getRes.body.manufacturer.connect_status).toBe('Onboarding');
    expect(getRes.body.manufacturer.stripe_connected_account_id).toBe('acct_test_1');
  });

  it('reuses the existing connected account on a second onboarding-link request', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const manufacturer = await createManufacturer(ownerToken);

    stripeClient.accounts.create.mockResolvedValueOnce({ id: 'acct_test_2' });
    stripeClient.accountLinks.create.mockResolvedValue({ url: 'https://connect.stripe.com/setup/x', expires_at: 1 });

    await request(app)
      .post(`/api/manufacturers/${manufacturer.id}/connect-onboarding-link`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send();

    const secondRes = await request(app)
      .post(`/api/manufacturers/${manufacturer.id}/connect-onboarding-link`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send();

    expect(secondRes.status).toBe(201);
    // Account created only once — the second call reuses stripe_connected_account_id.
    expect(stripeClient.accounts.create).toHaveBeenCalledTimes(1);
    expect(stripeClient.accountLinks.create).toHaveBeenCalledTimes(2);
  });
});

describe('Manufacturers — payouts', () => {
  async function onboardedManufacturer(ownerToken) {
    const manufacturer = await createManufacturer(ownerToken);
    stripeClient.accounts.create.mockResolvedValueOnce({ id: `acct_test_${Date.now()}` });
    stripeClient.accountLinks.create.mockResolvedValueOnce({ url: 'https://connect.stripe.com/setup/y', expires_at: 1 });
    await request(app)
      .post(`/api/manufacturers/${manufacturer.id}/connect-onboarding-link`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send();
    return manufacturer.id;
  }

  it('rejects a payout for a manufacturer that has not completed onboarding', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const manufacturer = await createManufacturer(ownerToken);

    const res = await request(app)
      .post(`/api/manufacturers/${manufacturer.id}/payouts`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amount: 500 });

    expect(res.status).toBe(400);
    expect(stripeClient.transfers.create).not.toHaveBeenCalled();
  });

  it('creates and lists a successful payout for an onboarded manufacturer', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const manufacturerId = await onboardedManufacturer(ownerToken);

    stripeClient.transfers.create.mockResolvedValueOnce({ id: 'tr_test_1' });

    const createRes = await request(app)
      .post(`/api/manufacturers/${manufacturerId}/payouts`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amount: 500.5 });

    expect(createRes.status).toBe(201);
    expect(createRes.body.payout.status).toBe('Paid');
    expect(createRes.body.payout.stripe_transfer_id).toBe('tr_test_1');
    expect(createRes.body.payout.currency).toBe('usd');

    const listRes = await request(app)
      .get(`/api/manufacturers/${manufacturerId}/payouts`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.payouts.some((p) => p.id === createRes.body.payout.id)).toBe(true);
  });

  it('records a payout as Failed (not silently dropped) when the Stripe transfer errors', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const manufacturerId = await onboardedManufacturer(ownerToken);

    stripeClient.transfers.create.mockRejectedValueOnce(new Error('destination account restricted'));

    const createRes = await request(app)
      .post(`/api/manufacturers/${manufacturerId}/payouts`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amount: 120 });

    expect(createRes.status).toBe(402);
    expect(createRes.body.payout.status).toBe('Failed');

    const listRes = await request(app)
      .get(`/api/manufacturers/${manufacturerId}/payouts`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const found = listRes.body.payouts.find((p) => p.id === createRes.body.payout.id);
    expect(found).toBeTruthy();
    expect(found.status).toBe('Failed');
  });

  it('a Technician (non-manager role) is blocked from creating a payout', async () => {
    const ownerToken = await loginAs('owner@dentallab.test');
    const techToken = await loginAs('tech1@dentallab.test');
    const manufacturerId = await onboardedManufacturer(ownerToken);

    const res = await request(app)
      .post(`/api/manufacturers/${manufacturerId}/payouts`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ amount: 100 });

    expect(res.status).toBe(403);
  });
});
