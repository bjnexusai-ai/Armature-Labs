const express = require('express');
const { requireAuth, requireInternal } = require('../middleware/auth');
const {
  createSavedReport,
  listSavedReports,
  deleteSavedReport,
} = require('../controllers/reports.controller');

const router = express.Router();

// Internal-staff-only — the Reporting module (§4.12) has no portal/dentist_client
// surface at all, so requireInternal (not a role-specific gate) is the right
// blanket restriction here; Revenue-type presets get the extra Owner/Office
// Manager check inside the controller since it depends on request body, not
// just the route.
router.use(requireAuth);
router.use(requireInternal);

router.post('/saved-reports', createSavedReport);
router.get('/saved-reports', listSavedReports);
router.delete('/saved-reports/:id', deleteSavedReport);

module.exports = router;
