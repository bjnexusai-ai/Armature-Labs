const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { approveApproval, requestChangesApproval } = require('../controllers/approvals.controller');

const router = express.Router();

router.use(requireAuth);

// Portal endpoint — gated on req.user.can_approve_photos inside the
// controller (loaded fresh from the DB by requireAuth, per standing
// convention), not on role, since that flag is the client's own §8 spec for
// who may act. Internal staff have this flag hard-false, so they're
// naturally excluded too.
router.post('/:id/approve', approveApproval);
router.post('/:id/request-changes', requestChangesApproval);

module.exports = router;
