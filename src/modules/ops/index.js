const express = require('express');
const dashboardRoutes = require('./dashboard');
const usersRoutes = require('./users');
const driversRoutes = require('./drivers');
const tripsRoutes = require('./trips');
const paymentsRoutes = require('./payments');
const supportRoutes = require('./support');
const schemaRoutes = require('./schema');
const authorizeRoles = require('../../middleware/authorizeRoles');

const router = express.Router();

router.use('/dashboard', dashboardRoutes);
router.use('/users', usersRoutes);
router.use('/drivers', driversRoutes);
router.use('/trips', tripsRoutes);
router.use('/payments', paymentsRoutes);
router.use('/support', supportRoutes);
router.use('/schema', authorizeRoles('admin'), schemaRoutes);

module.exports = router;
