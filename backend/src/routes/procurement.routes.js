const express = require('express');
const { requireAuth, requireInternal, requireManagerRole } = require('../middleware/auth');
const {
  createVendor,
  listVendors,
  createPurchaseOrder,
  listPurchaseOrders,
  getPurchaseOrder,
  updatePurchaseOrderStatus,
  receivePurchaseOrder,
} = require('../controllers/procurement.controller');

const router = express.Router();

router.use(requireAuth);
router.use(requireInternal);

// Vendors — Owner/Office Manager only, full CRUD-so-far (no update/delete
// this session — not in the confirmed Session 6 scope).
router.post('/vendors', requireManagerRole, createVendor);
router.get('/vendors', requireManagerRole, listVendors);

// Purchase orders — Owner/Office Manager only end to end, including
// receiving. (Physical receiving may end up being a technician task later;
// no client answer on that yet, so kept manager-only for this session.)
router.post('/purchase-orders', requireManagerRole, createPurchaseOrder);
router.get('/purchase-orders', requireManagerRole, listPurchaseOrders);
router.get('/purchase-orders/:id', requireManagerRole, getPurchaseOrder);
router.patch('/purchase-orders/:id/status', requireManagerRole, updatePurchaseOrderStatus);
router.post('/purchase-orders/:id/receive', requireManagerRole, receivePurchaseOrder);

module.exports = router;
