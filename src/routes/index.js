const express = require('express');
const router = express.Router();
const authRoutes = require('./v1/authRoutes');
const rideRoutes = require('./v1/rideRoutes');
const userRoutes = require('./v1/userRoutes');
const paymentRoutes = require('./v1/paymentRoutes');
const adminRoutes = require('./v1/adminRoutes');

router.use('/auth', authRoutes);
router.use('/rides', rideRoutes);
router.use('/users', userRoutes);
router.use('/payments', paymentRoutes);
router.use('/admin', adminRoutes);

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
