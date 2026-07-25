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
const { createNote, listNotes } = require('../controllers/notes.controller');
const { createProgressPhoto, listProgressPhotos } = require('../controllers/progressPhotos.controller');
const {
  createShipment,
  listShipments,
  createWarrantyClaim,
  listWarrantyClaims,
} = require('../controllers/fulfillment.controller');

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

// Session 5 — messaging/notes. Two-way (office + lab), so NOT requireInternal
// — tenant isolation (assertPracticeAccess, inside the controller) is what
// scopes a dentist_client to their own practice's cases instead.
router.post('/:id/notes', createNote);
router.get('/:id/notes', listNotes);

// Session 5 — progress_photos. Lab-staff only (see controller for why).
router.post('/:id/progress-photos', requireInternal, createProgressPhoto);
router.get('/:id/progress-photos', requireInternal, listProgressPhotos);

// Session 5 — shipments. Creation is staff-only and explicit (never
// auto-fired off a status change); reads are tenant-scoped, not
// staff-only, since the dental office has a legitimate interest in
// tracking/carrier info for their own case.
router.post('/:id/shipments', requireInternal, createShipment);
router.get('/:id/shipments', listShipments);

// Session 5 — warranty_claims. Either staff or the dentist_client that owns
// the case may file (see controller); only openable against a Delivered
// case, enforced in the controller via a read-only TERMINAL_STATUS import.
router.post('/:id/warranty-claims', createWarrantyClaim);
router.get('/:id/warranty-claims', listWarrantyClaims);

module.exports = router;
