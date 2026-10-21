const express = require('express');
const router = express.Router();
const authRoutes = require('./v1/authRoutes');
const rideRoutes = require('./v1/rideRoutes');
const userRoutes = require('./v1/userRoutes');
const paymentRoutes = require('./v1/paymentRoutes');
const adminRoutes = require('./v1/adminRoutes');
const passengerBookingRoutes = require('./v1/passengerBookingRoutes');
const riderRoutes = require('./v1/riderRoutes');
const seatReservationRoutes = require('./v1/seatReservationRoutes');
const tripRoutes = require('./v1/tripRoutes');

router.use('/auth', authRoutes);
router.use('/rides', rideRoutes);
router.use('/users', userRoutes);
router.use('/payments', paymentRoutes);
router.use('/admin', adminRoutes);
router.use('/passenger-bookings', passengerBookingRoutes);
router.use('/rider', riderRoutes);
router.use('/seat-reservations', seatReservationRoutes);
router.use('/trips', tripRoutes);

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
