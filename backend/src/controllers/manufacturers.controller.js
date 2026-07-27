const { z } = require('zod');
const { query } = require('../config/db');
const stripe = require('../services/stripeClient');

// New entity this session — see 0033_manufacturers.js and
// SESSION_8_PROMPT §0.3: not a repurposing of `vendors` (Session 6), which
// is procurement-scoped (material suppliers), a different concept.

const createManufacturerSchema = z
  .object({
    name: z.string().min(1).max(150),
    contactName: z.string().max(150).optional(),
    email: z.string().email().max(255).optional(),
    phone: z.string().max(30).optional(),
    country: z
      .string()
      .length(2)
      .transform((v) => v.toUpperCase()),
  })
  .strict();

async function createManufacturer(req, res) {
  const input = createManufacturerSchema.parse(req.body);
  const { rows } = await query(
    `INSERT INTO manufacturers (name, contact_name, email, phone, country)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, contact_name, email, phone, country, stripe_connected_account_id, connect_status, created_at`,
    [input.name, input.contactName || null, input.email || null, input.phone || null, input.country]
  );
  return res.status(201).json({ manufacturer: rows[0] });
}

async function listManufacturers(req, res) {
  const { rows } = await query(
    `SELECT id, name, contact_name, email, phone, country, stripe_connected_account_id, connect_status, created_at
     FROM manufacturers ORDER BY name`
  );
  return res.json({ manufacturers: rows });
}

async function getManufacturer(req, res) {
  const { rows } = await query(
    `SELECT id, name, contact_name, email, phone, country, stripe_connected_account_id, connect_status, created_at, updated_at
     FROM manufacturers WHERE id = $1`,
    [req.params.id]
  );
  const manufacturer = rows[0];
  if (!manufacturer) {
    return res.status(404).json({ error: 'Manufacturer not found.' });
  }
  return res.json({ manufacturer });
}

const updateManufacturerSchema = z
  .object({
    name: z.string().min(1).max(150).optional(),
    contactName: z.string().max(150).optional(),
    email: z.string().email().max(255).optional(),
    phone: z.string().max(30).optional(),
    country: z
      .string()
      .length(2)
      .transform((v) => v.toUpperCase())
      .optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required.' });

async function updateManufacturer(req, res) {
  const manufacturerId = req.params.id;
  const input = updateManufacturerSchema.parse(req.body);

  const existing = await query('SELECT id FROM manufacturers WHERE id = $1', [manufacturerId]);
  if (!existing.rows[0]) {
    return res.status(404).json({ error: 'Manufacturer not found.' });
  }

  const fieldMap = { name: 'name', contactName: 'contact_name', email: 'email', phone: 'phone', country: 'country' };
  const setClauses = [];
  const params = [];
  for (const [key, column] of Object.entries(fieldMap)) {
    if (input[key] !== undefined) {
      params.push(input[key]);
      setClauses.push(`${column} = $${params.length}`);
    }
  }
  params.push(manufacturerId);

  const { rows } = await query(
    `UPDATE manufacturers SET ${setClauses.join(', ')} WHERE id = $${params.length}
     RETURNING id, name, contact_name, email, phone, country, stripe_connected_account_id, connect_status, updated_at`,
    params
  );
  return res.json({ manufacturer: rows[0] });
}

/**
 * POST /api/manufacturers/:id/connect-onboarding-link
 *
 * Creates a Stripe Connect account for this manufacturer if one doesn't
 * exist yet (type from STRIPE_CONNECT_ACCOUNT_TYPE, default `standard` —
 * see .env.example), then returns a fresh account-link URL for onboarding.
 *
 * Deliberately does NOT hard-code or check against a list of "Stripe
 * payout-supported countries" — that list changes over time and baking a
 * stale copy into this codebase would be worse than letting Stripe's own
 * API surface the authoritative error. If the manufacturer's country isn't
 * supported for the chosen account type, Stripe's account-creation call
 * itself will fail; that error is passed through rather than swallowed
 * (see Gap Audit #16 / SESSION_8_PROMPT §0.2 — this is still an open
 * confirmation item, not resolved by this code).
 */
async function createConnectOnboardingLink(req, res) {
  const manufacturerId = req.params.id;
  const { rows } = await query(
    'SELECT id, country, stripe_connected_account_id, connect_status FROM manufacturers WHERE id = $1',
    [manufacturerId]
  );
  const manufacturer = rows[0];
  if (!manufacturer) {
    return res.status(404).json({ error: 'Manufacturer not found.' });
  }

  let accountId = manufacturer.stripe_connected_account_id;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: process.env.STRIPE_CONNECT_ACCOUNT_TYPE || 'standard',
      country: manufacturer.country,
    });
    accountId = account.id;
    await query(
      `UPDATE manufacturers SET stripe_connected_account_id = $1, connect_status = 'Onboarding' WHERE id = $2`,
      [accountId, manufacturerId]
    );
  }

  const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:5173';
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    type: 'account_onboarding',
    refresh_url: `${appBaseUrl}/manufacturers/${manufacturerId}/connect-refresh`,
    return_url: `${appBaseUrl}/manufacturers/${manufacturerId}/connect-complete`,
  });

  return res.status(201).json({ onboardingLink: { url: accountLink.url, expiresAt: accountLink.expires_at } });
}

module.exports = {
  createManufacturer,
  listManufacturers,
  getManufacturer,
  updateManufacturer,
  createConnectOnboardingLink,
};
