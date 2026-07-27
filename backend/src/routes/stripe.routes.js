const express = require('express');
const { requireAuth, requireBillingAccess, requirePortalPermission } = require('../middleware/auth');
const { createCheckoutSession, handleWebhook } = require('../controllers/stripe.controller');

/**
 * Checkout-session creation lives on invoices, so this router is mounted
 * under /api/billing in app.js (alongside billing.routes.js) rather than a
 * separate top-level path — kept consistent with the existing
 * /api/billing/invoices/:id namespace rather than introducing a second one
 * for the same resource. (SESSION_8_PROMPT §3 sketches this as
 * `/api/invoices/:id/checkout-session`; this is a deliberate, flagged
 * deviation to match the app's actual existing routing, not an oversight.)
 *
 * Gating mirrors billing.routes.js's `requireInvoiceReadAccess`: a
 * dentist_client needs can_view_invoices=true, internal staff need
 * Owner/Office Manager. Duplicated here (rather than importing the
 * unexported local function from billing.routes.js) to keep this file's
 * webhook-adjacent code self-contained per §3's separation intent.
 */
function requireCheckoutAccess(req, res, next) {
  if (req.user.role === 'dentist_client') {
    return requirePortalPermission('can_view_invoices')(req, res, next);
  }
  return requireBillingAccess(req, res, next);
}

const checkoutRouter = express.Router();
checkoutRouter.post('/invoices/:id/checkout-session', requireAuth, requireCheckoutAccess, createCheckoutSession);

/**
 * No requireAuth here — Stripe can't send a JWT (§5). Signature
 * verification inside handleWebhook (via STRIPE_WEBHOOK_SECRET) is the only
 * gate on this route. Must stay mounted ahead of express.json() in app.js
 * so req.body is the raw buffer Stripe's signature check needs.
 */
const webhookRouter = express.Router();
webhookRouter.post('/stripe', handleWebhook);

module.exports = { checkoutRouter, webhookRouter };
