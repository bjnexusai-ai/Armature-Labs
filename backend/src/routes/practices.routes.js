const express = require('express');
const { requireAuth, requireInternal, requireBillingAccess, requireManagerRole } = require('../middleware/auth');
const { createPractice, listPractices, getPractice } = require('../controllers/practices.controller');
const { setPracticeFeeSchedule } = require('../controllers/billing.controller');
const {
  createContract,
  listContracts,
  createPracticeNote,
  listPracticeNotes,
} = require('../controllers/accounts.controller');

const router = express.Router();

router.use(requireAuth);
router.get('/', listPractices);
router.get('/:id', getPractice);
router.post('/', requireInternal, createPractice);
// Session 4 — Owner/Office Manager assigns a practice's active fee
// schedule; lives under practices per the resource it's scoped to.
router.put('/:id/fee-schedule', requireBillingAccess, setPracticeFeeSchedule);

// Session 6 — Phase 3 CRM layer, internal-only (no dentist_client access),
// Owner/Office Manager gated same as fee-schedule assignment above.
router.post('/:id/contracts', requireManagerRole, createContract);
router.get('/:id/contracts', requireManagerRole, listContracts);
router.post('/:id/notes', requireManagerRole, createPracticeNote);
router.get('/:id/notes', requireManagerRole, listPracticeNotes);

module.exports = router;
