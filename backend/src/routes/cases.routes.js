const express = require('express');
const { requireAuth, requireInternal } = require('../middleware/auth');
const {
  createCase,
  listCases,
  getCase,
  updateCase,
  updateCaseStatus,
  uploadCaseMedia,
} = require('../controllers/cases.controller');
const {
  recordQcResult,
  listQcResults,
  createCaseRework,
  listCaseRework,
  createFinalApproval,
  getFinalApproval,
} = require('../controllers/qc.controller');

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
router.post('/:id/media', requireInternal, uploadCaseMedia);

// Session 4 — QC results, rework, and final approval are all lab-staff only,
// no portal access.
router.post('/:id/qc-results', requireInternal, recordQcResult);
router.get('/:id/qc-results', requireInternal, listQcResults);
router.post('/:id/rework', requireInternal, createCaseRework);
router.get('/:id/rework', requireInternal, listCaseRework);
router.post('/:id/final-approval', requireInternal, createFinalApproval);
router.get('/:id/final-approval', requireInternal, getFinalApproval);

module.exports = router;
