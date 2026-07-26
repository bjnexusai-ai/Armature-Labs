const express = require('express');
const { requireAuth, requireInternal } = require('../middleware/auth');
const { createShift, listShifts, createBooking, listBookings } = require('../controllers/planning.controller');

const router = express.Router();

router.use(requireAuth);
router.use(requireInternal);

// Capacity planning — open to any internal staff, both to create and read.
// Unlike vendor/PO management (manager-gated) this is closer to day-to-day
// scheduling that any technician or the office manager might need to do;
// no client answer specifies otherwise, so kept at requireInternal's floor
// rather than adding a stricter gate with no spec backing it.
router.post('/shifts', createShift);
router.get('/shifts', listShifts);
router.post('/bookings', createBooking);
router.get('/bookings', listBookings);

module.exports = router;
