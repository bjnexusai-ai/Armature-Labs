const express = require('express');
const { requireAuth, requireInternal, requireManagerRole } = require('../middleware/auth');
const {
  createEquipment,
  listEquipment,
  getEquipment,
  updateEquipmentStatus,
  createMaintenanceLog,
  listMaintenanceLogs,
} = require('../controllers/equipment.controller');

const router = express.Router();

router.use(requireAuth);
router.use(requireInternal);

// Catalog management — Owner/Office Manager only.
router.post('/', requireManagerRole, createEquipment);
router.patch('/:id/status', requireManagerRole, updateEquipmentStatus);

// Reads and maintenance logging — any internal staff. A technician
// servicing a machine should be able to log it themselves without routing
// through a manager, matching the inventory module's precedent of gating
// writes/catalog changes to managers but leaving day-to-day usage logging
// open to all internal staff.
router.get('/', listEquipment);
router.get('/:id', getEquipment);
router.post('/:id/maintenance-logs', createMaintenanceLog);
router.get('/:id/maintenance-logs', listMaintenanceLogs);

module.exports = router;
