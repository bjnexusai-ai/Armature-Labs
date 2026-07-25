const express = require('express');
const { requireAuth, requireInternal } = require('../middleware/auth');
const {
  createCase,
  listCases,
  getCase,
  updateCase,
  updateCaseStatus,
} = require('../controllers/cases.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/', listCases);
router.get('/:id', getCase);
router.post('/', requireInternal, createCase);
router.patch('/:id', requireInternal, updateCase);
// dentist_client is blocked here too — the portal is read-only on status,
// and stays that way even after Session 3 (the approvals flow calls this
// transition logic internally, not via this endpoint).
router.patch('/:id/status', requireInternal, updateCaseStatus);

module.exports = router;
