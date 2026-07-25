const express = require('express');
const { requireAuth, requireBillingAccess, requirePortalPermission } = require('../middleware/auth');
const {
  createFeeSchedule,
  listFeeSchedules,
  createInvoice,
  listInvoices,
  getInvoice,
  recordPayment,
} = require('../controllers/billing.controller');

const router = express.Router();

router.use(requireAuth);

// Fee schedules — internal Owner/Office Manager only, no portal access.
router.post('/fee-schedules', requireBillingAccess, createFeeSchedule);
router.get('/fee-schedules', requireBillingAccess, listFeeSchedules);

/**
 * Read access to invoices: internal staff must be Owner/Office Manager
 * (requireBillingAccess semantics — Assistant/Technician/Designer are
 * blocked per §4.7), OR a dentist_client with can_view_invoices set. Neither
 * existing middleware alone expresses this "either gate, depending on which
 * kind of user" rule, so it's composed here rather than bent out of shape.
 */
function requireInvoiceReadAccess(req, res, next) {
  if (req.user.role === 'dentist_client') {
    return requirePortalPermission('can_view_invoices')(req, res, next);
  }
  return requireBillingAccess(req, res, next);
}

// Invoices — internal creation restricted to Owner/Office Manager; portal
// (dentist_client) read access gated on can_view_invoices, per §4.7. Both
// paths flow through the same list/get controllers, which branch internally
// on req.user.role.
router.post('/invoices', requireBillingAccess, createInvoice);
router.get('/invoices', requireInvoiceReadAccess, listInvoices);
router.get('/invoices/:id', requireInvoiceReadAccess, getInvoice);

// Payments — manual mark-paid only this session (Stripe is Session 8),
// Owner/Office Manager only.
router.post('/invoices/:id/payments', requireBillingAccess, recordPayment);

module.exports = router;
