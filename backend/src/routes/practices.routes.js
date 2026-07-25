const express = require('express');
const { requireAuth, requireInternal, requireBillingAccess } = require('../middleware/auth');
const { createPractice, listPractices, getPractice } = require('../controllers/practices.controller');
const { setPracticeFeeSchedule } = require('../controllers/billing.controller');

const router = express.Router();

router.use(requireAuth);
router.get('/', listPractices);
router.get('/:id', getPractice);
router.post('/', requireInternal, createPractice);
// Session 4 — Owner/Office Manager assigns a practice's active fee
// schedule; lives under practices per the resource it's scoped to.
router.put('/:id/fee-schedule', requireBillingAccess, setPracticeFeeSchedule);

module.exports = router;
