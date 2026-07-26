const express = require('express');
const { requireAuth, requirePortalPermission } = require('../middleware/auth');
const {
  createPatient,
  listPatients,
  getPatient,
  updatePatient,
} = require('../controllers/patients.controller');

const router = express.Router();

router.use(requireAuth);

// Reads: internal staff see everything; dentist_client is scoped to their
// own practice via practiceScopeClause/assertPracticeAccess inside the
// controller (same pattern as cases.routes.js notes/warranty-claims).
router.get('/', listPatients);
router.get('/:id', getPatient);

// Writes: internal staff always allowed (requirePortalPermission is a no-op
// for non-dentist_client roles, per its own implementation). Dentist_client
// requires can_edit_patient_info — the exact client-spec flag this maps to.
router.post('/', requirePortalPermission('can_edit_patient_info'), createPatient);
router.patch('/:id', requirePortalPermission('can_edit_patient_info'), updatePatient);

module.exports = router;
