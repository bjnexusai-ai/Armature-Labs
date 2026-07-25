const express = require('express');
const { requireAuth, requireInternal } = require('../middleware/auth');
const { createPractice, listPractices, getPractice } = require('../controllers/practices.controller');

const router = express.Router();

router.use(requireAuth);
router.get('/', listPractices);
router.get('/:id', getPractice);
router.post('/', requireInternal, createPractice);

module.exports = router;
