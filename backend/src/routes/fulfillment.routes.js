const express = require('express');
const { requireAuth, requireInternal } = require('../middleware/auth');
const {
  updateShipmentStatus,
  resolveWarrantyClaim,
} = require('../controllers/fulfillment.controller');

// Session 5 — the two fulfillment endpoints that aren't scoped to a single
// case's URL: a shipment is addressed by its own id (a case can have more
// than one shipment, e.g. a reshipment after a warranty claim), and a
// warranty claim resolution likewise addresses the claim directly. Both
// are staff-only triage/logistics actions, not something a dentist_client
// does — filing a claim and reading shipment/claim history stay
// case-scoped under cases.routes.js; only these two "act on it" endpoints
// live here.
const router = express.Router();

router.use(requireAuth);
router.use(requireInternal);

router.patch('/shipments/:id/status', updateShipmentStatus);
router.patch('/warranty-claims/:id/resolve', resolveWarrantyClaim);

module.exports = router;
