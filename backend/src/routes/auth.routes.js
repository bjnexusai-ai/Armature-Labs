const express = require('express');
const { login, refresh, logout, logoutAll, me } = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth');
const { authRateLimiter } = require('../middleware/rateLimiter');
const router = express.Router();

router.post('/login', authRateLimiter, login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.post('/logout-all', requireAuth, logoutAll);
router.get('/me', requireAuth, me);

module.exports = router;
