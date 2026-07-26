const express = require('express');
const { requireAuth, requireInternal, requireManagerRole } = require('../middleware/auth');
const {
  createCategory,
  listCategories,
  createMaterial,
  listMaterials,
  getMaterial,
  consumeMaterial,
  adjustMaterial,
  listStockTransactions,
} = require('../controllers/inventory.controller');

const router = express.Router();

router.use(requireAuth);
router.use(requireInternal); // no dentist_client access anywhere in Phase 3 inventory/CRM

// Categories — catalog setup, Owner/Office Manager only.
router.post('/categories', requireManagerRole, createCategory);
router.get('/categories', listCategories);

// Materials — reads open to all internal staff; catalog-creation restricted
// to Owner/Office Manager, same as categories.
router.post('/materials', requireManagerRole, createMaterial);
router.get('/materials', listMaterials);
router.get('/materials/:id', getMaterial);

// Stock transactions — Consumption is a technician's day-to-day job (logging
// what they used on a case), so any internal staff can post it. Adjustment
// is a manual override and stays Owner/Office Manager only.
router.post('/materials/:id/consume', consumeMaterial);
router.post('/materials/:id/adjust', requireManagerRole, adjustMaterial);
router.get('/materials/:id/transactions', listStockTransactions);

module.exports = router;
