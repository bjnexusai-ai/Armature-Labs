const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { listRoles, listCaseTypes, listWorkflowStages } = require('../controllers/reference.controller');

const router = express.Router();

router.use(requireAuth);
router.get('/roles', listRoles);
router.get('/case-types', listCaseTypes);
router.get('/workflow-stages', listWorkflowStages);

module.exports = router;
