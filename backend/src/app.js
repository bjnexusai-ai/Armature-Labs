require('dotenv').config();
require('express-async-errors'); // must load before routes are required

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const authRoutes = require('./routes/auth.routes');
const usersRoutes = require('./routes/users.routes');
const practicesRoutes = require('./routes/practices.routes');
const patientsRoutes = require('./routes/patients.routes');
const casesRoutes = require('./routes/cases.routes');
const approvalsRoutes = require('./routes/approvals.routes');
const referenceRoutes = require('./routes/reference.routes');
const billingRoutes = require('./routes/billing.routes');
const qcRoutes = require('./routes/qc.routes');
const fulfillmentRoutes = require('./routes/fulfillment.routes');
const inventoryRoutes = require('./routes/inventory.routes');
const procurementRoutes = require('./routes/procurement.routes');
const reportsRoutes = require('./routes/reports.routes');
const equipmentRoutes = require('./routes/equipment.routes');
const planningRoutes = require('./routes/planning.routes');
const manufacturersRoutes = require('./routes/manufacturers.routes');
const { checkoutRouter: stripeCheckoutRoutes, webhookRouter: stripeWebhookRoutes } = require('./routes/stripe.routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { webhookRateLimiter } = require('./middleware/rateLimiter');

const app = express();

app.use(helmet());

// CORS: wide open (`cors()` with no options, reflects any origin) is fine
// for local dev / Codespaces — its preview URL changes every session, so
// there's no single fixed origin to pin there anyway. In production this
// must be locked to the real deployed frontend domain(s), read from
// CORS_ORIGIN (comma-separated if there's more than one, e.g. web +
// mobile's dev server). Fails loudly on boot if NODE_ENV=production and
// CORS_ORIGIN isn't set, rather than silently falling back to wide-open.
const corsOrigin = process.env.CORS_ORIGIN;
if (process.env.NODE_ENV === 'production' && !corsOrigin) {
  throw new Error('CORS_ORIGIN must be set in production — refusing to start with CORS wide open.');
}
const allowedOrigins = corsOrigin ? corsOrigin.split(',').map((o) => o.trim()) : null;
app.use(
  cors(
    allowedOrigins
      ? {
          origin: (origin, callback) => {
            // `origin` is undefined for same-origin/non-browser requests
            // (curl, server-to-server, Postman) — allow those through same
            // as before; only browser cross-origin requests are checked
            // against the allowlist.
            if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
            callback(new Error(`Origin ${origin} not allowed by CORS`));
          },
          credentials: true,
        }
      : undefined
  )
);

// ── Stripe webhook: MUST be mounted here, before express.json() below. ──
// Stripe's signature verification (see stripe.controller.js#handleWebhook)
// needs the raw, unparsed request body — if express.json() runs first, the
// body arrives as an already-parsed object and signature verification
// fails. Session 8 (SESSION_8_PROMPT §3) flags this explicitly as an easy
// thing to silently break by adding routes in the wrong order later — do
// not move this below the express.json() call, and do not add any other
// route between here and express.json() without checking this comment.
app.use('/api/webhooks', webhookRateLimiter, express.raw({ type: 'application/json' }), stripeWebhookRoutes);

app.use(express.json({ limit: '10mb' }));
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/practices', practicesRoutes);
app.use('/api/patients', patientsRoutes);
app.use('/api/cases', casesRoutes);
app.use('/api/approvals', approvalsRoutes);
app.use('/api/reference', referenceRoutes);
app.use('/api/billing', billingRoutes);
// Checkout-session creation is invoice-scoped, so it's mounted under the
// same /api/billing namespace as billingRoutes (see stripe.routes.js for
// why this is /api/billing/invoices/:id/checkout-session rather than the
// /api/invoices/:id/checkout-session sketched in SESSION_8_PROMPT §3).
app.use('/api/billing', stripeCheckoutRoutes);
app.use('/api/qc', qcRoutes);
app.use('/api/fulfillment', fulfillmentRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/procurement', procurementRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/planning', planningRoutes);
app.use('/api/manufacturers', manufacturersRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
