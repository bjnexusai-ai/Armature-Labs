const express = require('express');
const { requireAuth, requireManagerRole } = require('../middleware/auth');
const {
  createManufacturer,
  listManufacturers,
  getManufacturer,
  updateManufacturer,
  createConnectOnboardingLink,
} = require('../controllers/manufacturers.controller');
const { createPayout, listPayouts } = require('../controllers/payouts.controller');

const router = express.Router();

router.use(requireAuth);
// Manufacturer CRUD, onboarding links, and payouts are all Owner/Office
// Manager only (SESSION_8_PROMPT §5) — no dentist_client access anywhere
// in this router, and no distinction between internal roles either
// (Assistant/Technician/Designer are blocked, same as Session 6's
// procurement/practice-contracts gating). Applied once at the router
// level since every route here has the same gate.
router.use(requireManagerRole);

router.post('/', createManufacturer);
router.get('/', listManufacturers);
router.get('/:id', getManufacturer);
router.patch('/:id', updateManufacturer);

router.post('/:id/connect-onboarding-link', createConnectOnboardingLink);

router.post('/:id/payouts', createPayout);
router.get('/:id/payouts', listPayouts);

module.exports = router;
