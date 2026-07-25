const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { createUser, listUsers } = require('../controllers/users.controller');

const router = express.Router();

router.use(requireAuth);
// User account management restricted to Owner/Office Manager
// (Project Scope §2: Assistant/Technician/Designer explicitly blocked).
router.get('/', requireRole('owner', 'office_manager'), listUsers);
router.post('/', requireRole('owner', 'office_manager'), createUser);

module.exports = router;
