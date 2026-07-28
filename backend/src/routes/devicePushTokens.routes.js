const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { registerDevicePushToken, removeDevicePushToken } = require('../controllers/devicePushTokens.controller');

const router = express.Router();

router.use(requireAuth);

router.post('/', registerDevicePushToken);
router.delete('/', removeDevicePushToken);

module.exports = router;
