const express = require('express');
const { requireAuth, requireInternal } = require('../middleware/auth');
const { createChecklist, listChecklists, resolveCaseRework } = require('../controllers/qc.controller');

const router = express.Router();

router.use(requireAuth);
router.use(requireInternal); // QC/rework is lab-staff only, no portal access.

router.post('/checklists', createChecklist);
router.get('/checklists', listChecklists);

// Not case-scoped — operates directly on a rework record by its own id,
// since resolving doesn't need the case context cases.routes.js provides.
router.patch('/rework/:id/resolve', resolveCaseRework);

module.exports = router;
