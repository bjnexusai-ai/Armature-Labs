const express = require('express');
const { login, refresh, me } = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/login', login);
router.post('/refresh', refresh);
router.get('/me', requireAuth, me);

module.exports = router;
